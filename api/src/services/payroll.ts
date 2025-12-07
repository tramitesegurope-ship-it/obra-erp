import { AttendanceStatus, PayrollAdjustmentType, PayrollPeriodStatus, Prisma } from '@prisma/client';
import prisma from '../db';

const ZERO = new Prisma.Decimal(0);
const THIRTY = new Prisma.Decimal(30);

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

const toDecimal = (value: DecimalLike): Prisma.Decimal => {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined || value === '') return ZERO;
  return new Prisma.Decimal(value);
};

const round2 = (value: Prisma.Decimal): Prisma.Decimal =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

const asNumber = (value: Prisma.Decimal): number =>
  Number(round2(value).toString());

const minutesToHoursDecimal = (minutes: number): Prisma.Decimal => {
  if (!Number.isFinite(minutes) || minutes <= 0) return ZERO;
  return new Prisma.Decimal(minutes).dividedBy(60);
};

const DAY_MS = 24 * 60 * 60 * 1000;
const STANDARD_MONTH_DAYS = 30;

const toUTCDateOnly = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const diffInDaysInclusive = (start: Date, end: Date): number => {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / DAY_MS) + 1;
};

const startOfWeekUTC = (value: Date): Date => {
  const date = toUTCDateOnly(value);
  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - diff);
  return start;
};

const weekKey = (value: Date): string => startOfWeekUTC(value).toISOString().slice(0, 10);

const toISODateString = (value: Date | null | undefined): string | null => {
  if (!value) return null;
  return toUTCDateOnly(value).toISOString().slice(0, 10);
};

type ComputeContext = {
  period: {
    id: number;
    startDate: Date;
    endDate: Date;
    workingDays: number;
  };
  employee: Prisma.EmployeeGetPayload<{}>;
  attendance: Prisma.AttendanceRecordGetPayload<{}>[];
  adjustments: Prisma.PayrollAdjustmentGetPayload<{}>[];
};

const computeEntry = ({ period, employee, attendance, adjustments }: ComputeContext) => {
  const monthlyBaseSalary = toDecimal(employee.baseSalary);
  const dailyRate = THIRTY.gt(0) ? monthlyBaseSalary.dividedBy(THIRTY) : ZERO;

  const dailyHours = toDecimal(employee.dailyHours ?? 8);
  const hourlyRate = dailyHours.gt(0) ? dailyRate.dividedBy(dailyHours) : ZERO;

  const periodStartUTC = toUTCDateOnly(period.startDate);
  const periodEndUTC = toUTCDateOnly(period.endDate);
  const rawPeriodDays = diffInDaysInclusive(periodStartUTC, periodEndUTC);
  const configuredWorkingDays = Number(period.workingDays ?? STANDARD_MONTH_DAYS);
  const payrollPeriodDays = Math.max(
    1,
    Math.min(
      Number.isFinite(configuredWorkingDays) && configuredWorkingDays > 0
        ? Math.round(configuredWorkingDays)
        : rawPeriodDays > 0
          ? rawPeriodDays
          : STANDARD_MONTH_DAYS,
      STANDARD_MONTH_DAYS,
    ),
  );
  const calendarPeriodDays = rawPeriodDays > 0 ? rawPeriodDays : STANDARD_MONTH_DAYS;

  const employeeStartUTC = employee.startDate ? toUTCDateOnly(employee.startDate) : null;
  const employeeEndUTC = employee.endDate ? toUTCDateOnly(employee.endDate) : null;

  let effectiveStartUTC: Date | null = periodStartUTC;
  if (employeeStartUTC && employeeStartUTC > periodStartUTC) {
    effectiveStartUTC = employeeStartUTC;
  }
  let effectiveEndUTC: Date | null = periodEndUTC;
  if (employeeEndUTC && employeeEndUTC < periodEndUTC) {
    effectiveEndUTC = employeeEndUTC;
  }

  if (
    (employeeStartUTC && employeeStartUTC > periodEndUTC) ||
    (employeeEndUTC && employeeEndUTC < periodStartUTC) ||
    (effectiveStartUTC && effectiveEndUTC && effectiveStartUTC > effectiveEndUTC)
  ) {
    effectiveStartUTC = null;
    effectiveEndUTC = null;
  }

  let eligibleDays = 0;
  if (effectiveStartUTC && effectiveEndUTC) {
    const rawEligibleDays = diffInDaysInclusive(effectiveStartUTC, effectiveEndUTC);
    if (rawEligibleDays > 0) {
      let normalizedEligible =
        calendarPeriodDays > 0 && rawEligibleDays >= calendarPeriodDays
          ? payrollPeriodDays
          : Math.min(rawEligibleDays, payrollPeriodDays);
      if (normalizedEligible <= 0) normalizedEligible = 1;
      eligibleDays = normalizedEligible;
    }
  }

  let absenceDays = 0;
  let workedDays = 0;
  let tardinessMinutes = 0;
  let permissionHours = ZERO;
  let overtimeHours = ZERO;
  let permissionDays = 0;
  let holidayDays = 0;
  let consideredRecords = 0;
  const sundayPenaltyWeeks = new Set<string>();
  let weekendSundayDays = 0;

  const withinRange = (recordDate: Date) => {
    if (!effectiveStartUTC || !effectiveEndUTC) return false;
    const current = toUTCDateOnly(recordDate).getTime();
    return current >= effectiveStartUTC.getTime() && current <= effectiveEndUTC.getTime();
  };

  for (const record of attendance) {
    if (!withinRange(record.date)) continue;
    consideredRecords += 1;

    const status = record.status;
    const holidayUnits = Math.max(
      Number(record.holidayCount ?? (record.holidayWorked ? 1 : 0)) || 0,
      0,
    );

    const recordDate = toUTCDateOnly(record.date);
    const dayOfWeek = recordDate.getUTCDay();
    const workedStatus =
      status === AttendanceStatus.PRESENT ||
      status === AttendanceStatus.TARDY ||
      (status === AttendanceStatus.PERMISSION && (record.permissionPaid ?? false));

    if (workedStatus && dayOfWeek === 0) {
      weekendSundayDays += 1;
    }

    if (status === AttendanceStatus.ABSENT) {
      absenceDays += 1;
      if (employee.absenceSundayPenalty) {
        sundayPenaltyWeeks.add(weekKey(record.date));
      }
      if (holidayUnits > 0) holidayDays += holidayUnits;
      continue;
    }

    if (status === AttendanceStatus.PERMISSION) {
      const isPaid = record.permissionPaid ?? false;
      if (!isPaid) {
        permissionDays += 1;
        const hours = toDecimal(record.permissionHours ?? dailyHours);
        const effectiveHours = hours.gt(0) ? hours : dailyHours;
        permissionHours = permissionHours.plus(effectiveHours);
      } else {
        workedDays += 1;
      }
      if (holidayUnits > 0) {
        holidayDays += holidayUnits;
      }

      const extra = toDecimal(record.extraHours ?? 0);
      if (extra.gt(0)) {
        overtimeHours = overtimeHours.plus(extra);
      }
      continue;
    }

    if (status === AttendanceStatus.TARDY) {
      tardinessMinutes += record.minutesLate ?? 0;
    }

    const extra = toDecimal(record.extraHours ?? 0);
    if (extra.gt(0)) {
      overtimeHours = overtimeHours.plus(extra);
    }

    workedDays += 1;
    if (holidayUnits > 0) {
      holidayDays += holidayUnits;
    }
  }

  const eligibleDaysDecimal = new Prisma.Decimal(eligibleDays);
  const payrollPeriodDaysDecimal = new Prisma.Decimal(payrollPeriodDays);
  const eligibleRatio =
    payrollPeriodDaysDecimal.gt(0) ? eligibleDaysDecimal.dividedBy(payrollPeriodDaysDecimal) : ZERO;
  const baseSalary = round2(monthlyBaseSalary.mul(eligibleRatio));

  workedDays = Math.min(workedDays, eligibleDays);
  const recordedAbsenceDays = Math.min(absenceDays, eligibleDays);
  permissionDays = Math.min(permissionDays, eligibleDays);

  const baseAbsenceDays = recordedAbsenceDays;
  const potentialPenalty = employee.absenceSundayPenalty ? sundayPenaltyWeeks.size : 0;
  const maxExtraAbsence = Math.max(eligibleDays - baseAbsenceDays, 0);
  const absencePenaltyDays = Math.min(potentialPenalty, maxExtraAbsence);
  const chargedAbsenceDays = Math.min(eligibleDays, baseAbsenceDays + absencePenaltyDays);

  const tardinessHours = minutesToHoursDecimal(tardinessMinutes);
  const tardinessDeduction = round2(hourlyRate.mul(tardinessHours));
  const absenceDeduction = round2(dailyRate.mul(new Prisma.Decimal(chargedAbsenceDays)));
  const permissionDeduction = round2(hourlyRate.mul(permissionHours));

  const overtimeAmount = hourlyRate.mul(overtimeHours);
  const holidayAmount = dailyRate.mul(new Prisma.Decimal(holidayDays));
  const weekendSundayAmount = dailyRate.mul(new Prisma.Decimal(weekendSundayDays));
  const overtimeBonus = round2(overtimeAmount);
  const holidayBonus = round2(holidayAmount);
  const weekendSundayBonus = round2(weekendSundayAmount);

  let manualBonuses = ZERO;
  let manualDeductions = ZERO;
  let advanceDeductions = ZERO;
  for (const adj of adjustments) {
    const amount = toDecimal(adj.amount);
    if (adj.type === PayrollAdjustmentType.BONUS) {
      manualBonuses = manualBonuses.plus(amount);
    } else {
      manualDeductions = manualDeductions.plus(amount);
      if (adj.type === PayrollAdjustmentType.ADVANCE) {
        advanceDeductions = advanceDeductions.plus(amount);
      }
    }
  }
  const manualBonusesRounded = round2(manualBonuses);
  const manualDeductionsRounded = round2(manualDeductions);
  const manualAdvancesRounded = round2(advanceDeductions);

  const grossEarnings = baseSalary
    .plus(overtimeBonus)
    .plus(holidayBonus)
    .plus(weekendSundayBonus)
    .plus(manualBonusesRounded);

  const pensionBase = grossEarnings
    .minus(absenceDeduction)
    .minus(tardinessDeduction)
    .minus(permissionDeduction);

  const pensionRate = toDecimal(employee.pensionRate ?? 0);
  const healthRate = toDecimal(employee.healthRate ?? 0);

  const pensionAmount = round2(
    pensionRate.gt(0) ? pensionBase.mul(pensionRate) : ZERO,
  );
  const healthAmount = round2(
    healthRate.gt(0) ? grossEarnings.mul(healthRate) : ZERO,
  );

  const netPay = round2(
    grossEarnings
      .minus(absenceDeduction)
      .minus(tardinessDeduction)
      .minus(permissionDeduction)
      .minus(manualDeductionsRounded)
      .minus(pensionAmount),
  );

  const entryData = {
    baseSalary: round2(baseSalary),
    dailyRate: round2(dailyRate),
    hourlyRate: round2(hourlyRate),
    workedDays,
    absenceDays: chargedAbsenceDays,
    tardinessMinutes,
    permissionHours: round2(permissionHours),
    overtimeHours: round2(overtimeHours),
    permissionDays,
    holidayDays,
    holidayBonus,
    bonusesTotal: round2(
      overtimeBonus.plus(holidayBonus).plus(manualBonusesRounded).plus(weekendSundayBonus),
    ),
    deductionsTotal: round2(
      manualDeductionsRounded.plus(absenceDeduction).plus(tardinessDeduction).plus(permissionDeduction),
    ),
    pensionAmount,
    healthAmount,
    grossEarnings: round2(grossEarnings),
    netPay,
    details: {
      attendance: {
        totalRecords: consideredRecords,
        workedDays,
        absenceDays: chargedAbsenceDays,
        recordedAbsenceDays,
        absencePenaltyDays,
        penaltyWeeks: employee.absenceSundayPenalty ? sundayPenaltyWeeks.size : 0,
        sundayPenaltyApplied: Boolean(employee.absenceSundayPenalty && absencePenaltyDays > 0),
        tardinessMinutes,
        permissionDays,
        permissionHours: asNumber(round2(permissionHours)),
        overtimeHours: asNumber(round2(overtimeHours)),
        holidayDays,
        eligibleDays,
        periodDays: payrollPeriodDays,
        startDate: toISODateString(employeeStartUTC),
        periodStart: toISODateString(periodStartUTC),
        periodEnd: toISODateString(periodEndUTC),
        weekendSundayDays,
      },
      breakdown: {
        baseSalary: asNumber(round2(baseSalary)),
        dailyRate: asNumber(round2(dailyRate)),
        hourlyRate: asNumber(round2(hourlyRate)),
        overtimeBonus: asNumber(overtimeBonus),
        holidayBonus: asNumber(holidayBonus),
        weekendSundayBonus: asNumber(weekendSundayBonus),
        manualBonuses: asNumber(manualBonusesRounded),
        manualDeductions: asNumber(manualDeductionsRounded),
        manualAdvances: asNumber(manualAdvancesRounded),
        absenceDeduction: asNumber(absenceDeduction),
        tardinessDeduction: asNumber(tardinessDeduction),
        permissionDeduction: asNumber(permissionDeduction),
        absencePenaltyDays,
        monthlyBase: asNumber(round2(monthlyBaseSalary)),
        eligibleDays,
        periodDays: payrollPeriodDays,
      },
      pension: {
        system: employee.pensionSystem,
        rate: Number(round2(pensionRate)),
        amount: asNumber(pensionAmount),
      },
      health: {
        rate: Number(round2(healthRate)),
        amount: asNumber(healthAmount),
      },
    },
  };

  return {
    entryData,
    summary: {
      absenceDeduction: asNumber(absenceDeduction),
      tardinessDeduction: asNumber(tardinessDeduction),
      permissionDeduction: asNumber(permissionDeduction),
      overtimeBonus: asNumber(overtimeBonus),
      holidayBonus: asNumber(holidayBonus),
      manualBonuses: asNumber(manualBonusesRounded),
      manualDeductions: asNumber(manualDeductionsRounded),
      manualAdvances: asNumber(manualAdvancesRounded),
      weekendSundayBonus: asNumber(weekendSundayBonus),
      pensionAmount: asNumber(pensionAmount),
      healthAmount: asNumber(healthAmount),
      netPay: asNumber(netPay),
      grossEarnings: asNumber(round2(grossEarnings)),
    },
  };
};

export async function generatePayrollPeriod(
  periodId: number,
  options: { recalcClosed?: boolean } = {},
) {
  return prisma.$transaction(async tx => {
    const period = await tx.payrollPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period) {
      throw new Error('Periodo no encontrado');
    }
    if (period.status === PayrollPeriodStatus.CLOSED && !options.recalcClosed) {
      throw new Error('El periodo está cerrado. Habilita recalcClosed para recalcular.');
    }

    const employeeWhere: Prisma.EmployeeWhereInput = {
      isActive: true,
      AND: [
        {
          OR: [{ startDate: null }, { startDate: { lte: period.endDate } }],
        },
        {
          OR: [{ endDate: null }, { endDate: { gte: period.startDate } }],
        },
      ],
    };
    if (period.obraId) {
      employeeWhere.OR = [
        { obraId: period.obraId },
        { obraId: null },
      ];
    }

    const employees = await tx.employee.findMany({
      where: employeeWhere,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const employeeIds = employees.map(emp => emp.id);
    const attendanceRecords = await tx.attendanceRecord.findMany({
      where: {
        employeeId: { in: employeeIds },
        date: {
          gte: period.startDate,
          lte: period.endDate,
        },
      },
      orderBy: { date: 'asc' },
    });
    const attendanceByEmployee = new Map<number, typeof attendanceRecords>();
    for (const record of attendanceRecords) {
      const list = attendanceByEmployee.get(record.employeeId);
      if (list) list.push(record);
      else attendanceByEmployee.set(record.employeeId, [record]);
    }

    const existingEntries = await tx.payrollEntry.findMany({
      where: { periodId },
      include: { adjustments: true },
    });
    const employeeIdSet = new Set(employeeIds);
    const entriesToRemove = existingEntries.filter(entry => !employeeIdSet.has(entry.employeeId));
    if (entriesToRemove.length) {
      await tx.payrollEntry.deleteMany({
        where: { id: { in: entriesToRemove.map(entry => entry.id) } },
      });
    }

    if (employees.length === 0) {
      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: { status: PayrollPeriodStatus.PROCESSED },
      });
      return { period, entries: [], totals: { neto: 0, planilla: 0, empleados: 0 } };
    }

    const adjustmentsByEmployee = new Map<number, Prisma.PayrollAdjustmentGetPayload<{}>[]>();
    for (const entry of existingEntries) {
      adjustmentsByEmployee.set(entry.employeeId, entry.adjustments);
    }

    const results: Array<{ employeeId: number; netPay: number }> = [];

    for (const employee of employees) {
      const attendance = attendanceByEmployee.get(employee.id) ?? [];
      const adjustments = adjustmentsByEmployee.get(employee.id) ?? [];

      const { entryData, summary } = computeEntry({
        period,
        employee,
        attendance,
        adjustments,
      });

      await tx.payrollEntry.upsert({
        where: { periodId_employeeId: { periodId, employeeId: employee.id } },
        create: {
          periodId,
          employeeId: employee.id,
          ...entryData,
        },
        update: {
          ...entryData,
        },
      });

      results.push({ employeeId: employee.id, netPay: summary.netPay });
    }

    await tx.payrollPeriod.update({
      where: { id: periodId },
      data: { status: PayrollPeriodStatus.PROCESSED },
    });

    const totalNeto = results.reduce((acc, res) => acc + res.netPay, 0);
    return {
      periodId,
      totals: {
        neto: Number(totalNeto.toFixed(2)),
        empleados: employees.length,
        planilla: Number(totalNeto.toFixed(2)),
      },
    };
  });
}

export async function recalculatePayrollEntry(entryId: number) {
  return prisma.$transaction(async tx => {
    const entry = await tx.payrollEntry.findUnique({
      where: { id: entryId },
      include: {
        period: true,
        employee: true,
        adjustments: true,
      },
    });
    if (!entry) throw new Error('Boleta no encontrada');

    const attendance = await tx.attendanceRecord.findMany({
      where: {
        employeeId: entry.employeeId,
        date: {
          gte: entry.period.startDate,
          lte: entry.period.endDate,
        },
      },
    });

    const { entryData } = computeEntry({
      period: entry.period,
      employee: entry.employee,
      attendance,
      adjustments: entry.adjustments,
    });

    const updated = await tx.payrollEntry.update({
      where: { id: entryId },
      data: entryData,
    });

    return updated;
  });
}

export async function closePayrollPeriod(periodId: number) {
  return prisma.payrollPeriod.update({
    where: { id: periodId },
    data: { status: PayrollPeriodStatus.CLOSED },
  });
}

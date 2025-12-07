import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { personnelApi } from '../lib/api';
import { useDeleteAuth } from '../hooks/useDeleteAuth';
import { getDeletePassword } from '../lib/deleteAuth';
import { SearchableSelect } from '../components/SearchableSelect';
const ATTENDANCE_OPTIONS = ['PRESENT', 'TARDY', 'ABSENT', 'PERMISSION'];
const ADJUSTMENT_LABELS = {
    BONUS: 'Ingreso / bono',
    DEDUCTION: 'Descuento',
    ADVANCE: 'Adelanto de sueldo',
};
const ADJUSTMENT_OPTIONS = ['BONUS', 'DEDUCTION', 'ADVANCE'];
const ADJUSTMENT_SELECT_OPTIONS = ADJUSTMENT_OPTIONS.map(option => ({
    value: option,
    label: ADJUSTMENT_LABELS[option],
}));
const PERIOD_STATUS_LABEL = {
    OPEN: 'Abierto',
    PROCESSED: 'Procesado',
    CLOSED: 'Cerrado',
};
const PENSION_SYSTEM_OPTIONS = [
    { value: 'ONP', label: 'ONP (13%)' },
    { value: 'AFP', label: 'AFP' },
    { value: 'SNP', label: 'SNP' },
    { value: 'NINGUNO', label: 'No aplica' },
    { value: 'EXONERADO', label: 'Exonerado' },
];
const YES_NO_OPTIONS = [
    { value: 'paid', label: 'Con goce' },
    { value: 'unpaid', label: 'Sin goce' },
];
const BANK_TYPE_OPTIONS = [
    { value: 'BCP', label: 'BCP' },
    { value: 'INTERBANK', label: 'Interbank' },
    { value: 'SCOTIABANK', label: 'Scotiabank' },
    { value: 'BANCO_NACION', label: 'Banco de la Nación' },
    { value: 'YAPE_PLIN', label: 'Yape/Plin' },
    { value: 'OTROS', label: 'Otros' },
];
const BANK_TYPE_LABELS = {
    BCP: 'BCP',
    INTERBANK: 'Interbank',
    SCOTIABANK: 'Scotiabank',
    BANCO_NACION: 'Banco de la Nación',
    YAPE_PLIN: 'Yape/Plin',
    OTROS: 'Otros',
};
const resolveBankLabel = (value) => {
    if (!value)
        return '—';
    const key = value;
    return BANK_TYPE_LABELS[key] ?? value;
};
const EMPLOYEE_AREA_OPTIONS = [
    { value: 'OPERATIVE', label: 'Área operativa' },
    { value: 'ADMINISTRATIVE', label: 'Área administrativa' },
];
const EMPLOYEE_AREA_VALUES = ['OPERATIVE', 'ADMINISTRATIVE'];
const EMPLOYEE_AREA_LABELS = {
    OPERATIVE: 'Área operativa',
    ADMINISTRATIVE: 'Área administrativa',
};
const AREA_FILTER_BUTTONS = [
    { value: 'ALL', label: 'Todas' },
    { value: 'OPERATIVE', label: 'Operativa' },
    { value: 'ADMINISTRATIVE', label: 'Administrativa' },
];
const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTH_SELECT_OPTIONS = MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name }));
const DEFAULT_ACCUMULATION_MONTHS = 3;
const MAX_ACCUMULATION_MONTHS = 6;
const PEN_NUMBER_FORMAT = new Intl.NumberFormat('es-PE', {
    useGrouping: true,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const createDeductionBreakdown = () => ({
    absence: 0,
    permission: 0,
    tardiness: 0,
    manual: 0,
});
const createExtrasTotals = () => ({
    advances: 0,
    holidays: 0,
    overtime: 0,
    bonuses: 0,
});
const createAreaExtrasMap = () => ({
    ALL: createExtrasTotals(),
    OPERATIVE: createExtrasTotals(),
    ADMINISTRATIVE: createExtrasTotals(),
});
const currency = (value) => `S/ ${PEN_NUMBER_FORMAT.format(value ?? 0)}`;
const fixed2 = (value) => PEN_NUMBER_FORMAT.format(value ?? 0);
const HOURS_PER_DAY_DEFAULT = 8;
const resolveManualAdvances = (entry) => {
    const breakdownValue = entry.details?.breakdown?.manualAdvances;
    if (typeof breakdownValue === 'number' && Number.isFinite(breakdownValue)) {
        return Math.max(breakdownValue, 0);
    }
    if (entry.adjustments?.length) {
        return entry.adjustments.reduce((acc, adjustment) => {
            if (adjustment.type !== 'ADVANCE')
                return acc;
            const amount = Number(adjustment.amount);
            return acc + (Number.isFinite(amount) ? amount : 0);
        }, 0);
    }
    return 0;
};
const resolveDeductionComponents = (entry) => {
    const breakdown = (entry.details?.breakdown ?? {});
    const absence = Number(breakdown?.absenceDeduction ?? 0) || 0;
    const permission = Number(breakdown?.permissionDeduction ?? 0) || 0;
    const tardiness = Number(breakdown?.tardinessDeduction ?? 0) || 0;
    const manualAdvances = Number(breakdown?.manualAdvances ?? 0) || 0;
    const manualDeductionsRaw = Number(breakdown?.manualDeductions ?? 0) || 0;
    const manualDeductions = Math.max(0, manualDeductionsRaw - manualAdvances);
    return {
        absence,
        permission,
        tardiness,
        manual: manualDeductions,
    };
};
const resolveActualDeductions = (entry) => {
    const components = resolveDeductionComponents(entry);
    return Math.max(components.absence + components.permission + components.tardiness + components.manual, 0);
};
const formatDeductionBreakdown = (components) => {
    const parts = [];
    if (components.absence > 0.005)
        parts.push(`Faltas ${currency(components.absence)}`);
    if (components.permission > 0.005)
        parts.push(`Permisos sin goce ${currency(components.permission)}`);
    if (components.tardiness > 0.005)
        parts.push(`Tardanzas ${currency(components.tardiness)}`);
    if (components.manual > 0.005)
        parts.push(`Penalidades/ajustes ${currency(components.manual)}`);
    return parts.length ? parts.join(' · ') : 'Sin descuentos registrados';
};
const buildDeductionBreakdownParts = (components) => {
    const parts = [];
    if (components.absence > 0.005)
        parts.push({ key: 'absence', label: 'Faltas', value: components.absence });
    if (components.permission > 0.005)
        parts.push({ key: 'permission', label: 'Permisos sin goce', value: components.permission });
    if (components.tardiness > 0.005)
        parts.push({ key: 'tardiness', label: 'Tardanzas', value: components.tardiness });
    if (components.manual > 0.005)
        parts.push({ key: 'manual', label: 'Penalidades/ajustes', value: components.manual });
    return parts;
};
const formatHoursQuantity = (hours) => {
    const rounded = Math.round(hours * 100) / 100;
    if (!Number.isFinite(rounded) || rounded <= 0)
        return '';
    const nearest = Math.round(rounded);
    const safe = Math.abs(rounded - nearest) < 1e-2 ? nearest : rounded;
    const text = Number.isInteger(safe) ? String(safe) : safe.toFixed(2);
    return `${text} ${safe === 1 ? 'hora' : 'horas'}`;
};
const normalizeQuantity = (value, epsilon = 1e-2) => {
    if (!Number.isFinite(value))
        return 0;
    if (Math.abs(value - Math.round(value)) < epsilon)
        return Math.round(value);
    return Math.abs(value) < epsilon ? 0 : value;
};
const formatIntegerDays = (days) => `${days} ${days === 1 ? 'día' : 'días'}`;
const formatDaysWithPartialHours = (days, hours, hoursPerDay = HOURS_PER_DAY_DEFAULT) => {
    const baseDays = Math.floor(days + 1e-6);
    let totalHours = Math.max(0, (days - baseDays) * hoursPerDay + hours);
    let roundedHours = Math.round(totalHours);
    if (roundedHours >= hoursPerDay) {
        return formatIntegerDays(baseDays + 1);
    }
    const dayLabel = formatIntegerDays(baseDays);
    if (roundedHours <= 0)
        return dayLabel;
    return `${dayLabel} y ${formatHoursDetailed(roundedHours, true)}`;
};
const formatHoursOrZero = (hours) => formatHoursQuantity(hours ?? 0) || '0 horas';
const formatHoursDetailed = (hours, alwaysShow = false) => {
    const rounded = Math.round(hours * 100) / 100;
    if (!alwaysShow && (!Number.isFinite(rounded) || rounded <= 0))
        return '';
    const safe = Number.isFinite(rounded) ? Math.max(rounded, 0) : 0;
    const isInteger = Math.abs(Math.round(safe) - safe) < 1e-6;
    const text = isInteger ? String(Math.round(safe)).padStart(2, '0') : safe.toFixed(2);
    return `${text} ${safe === 1 ? 'hora' : 'horas'}`;
};
const formatDaysWithHours = (daysValue, hoursPerDay = HOURS_PER_DAY_DEFAULT) => {
    const safeHoursPerDay = Number.isFinite(hoursPerDay) && hoursPerDay > 0 ? hoursPerDay : HOURS_PER_DAY_DEFAULT;
    const safeValue = Number.isFinite(daysValue) ? Math.max(daysValue, 0) : 0;
    const totalHours = safeValue * safeHoursPerDay;
    let wholeDays = Math.floor(totalHours / safeHoursPerDay + 1e-6);
    let remainingHours = totalHours - wholeDays * safeHoursPerDay;
    if (remainingHours < 1e-4)
        remainingHours = 0;
    if (remainingHours >= safeHoursPerDay - 1e-4) {
        wholeDays += 1;
        remainingHours = 0;
    }
    const hoursText = formatHoursQuantity(remainingHours);
    const dayLabel = wholeDays === 1 ? 'día' : 'días';
    if (wholeDays <= 0 && hoursText)
        return hoursText;
    if (!hoursText)
        return `${wholeDays} ${dayLabel}`;
    return `${wholeDays} ${dayLabel} ${hoursText}`;
};
const formatDaysAndExplicitHours = (daysValue, hoursPerDay = HOURS_PER_DAY_DEFAULT) => {
    const safeHoursPerDay = Number.isFinite(hoursPerDay) && hoursPerDay > 0 ? hoursPerDay : HOURS_PER_DAY_DEFAULT;
    const safeValue = Number.isFinite(daysValue) ? Math.max(daysValue, 0) : 0;
    const wholeDays = Math.floor(safeValue + 1e-6);
    const fractional = safeValue - wholeDays;
    let remainderHours = Math.round(fractional * safeHoursPerDay * 100) / 100;
    let displayDays = wholeDays;
    if (remainderHours >= safeHoursPerDay - 0.01) {
        displayDays += 1;
        remainderHours = 0;
    }
    const daysLabel = `${displayDays} ${displayDays === 1 ? 'día' : 'días'}`;
    if (remainderHours < 0.01)
        return daysLabel;
    return `${daysLabel} y ${formatHoursDetailed(remainderHours, true)}`;
};
const computePayrollDayInfo = (entry, breakdown, attendance, options = {}) => {
    const hoursPerDay = (() => {
        const dailyRate = breakdown?.dailyRate;
        const hourlyRate = breakdown?.hourlyRate;
        if (dailyRate && hourlyRate) {
            const ratio = dailyRate / hourlyRate;
            if (Number.isFinite(ratio) && ratio > 0) {
                return Math.min(Math.max(ratio, 4), 24);
            }
        }
        return HOURS_PER_DAY_DEFAULT;
    })();
    const baseDays = typeof options.baseDays === 'number' && options.baseDays > 0 ? options.baseDays : 30;
    const displayDays = attendance?.periodDays ??
        breakdown?.periodDays ??
        (typeof options.displayDaysFallback === 'number' && options.displayDaysFallback > 0
            ? options.displayDaysFallback
            : baseDays);
    let workedDays = entry.workedDays ?? attendance?.workedDays ?? 0;
    const absenceDays = entry.absenceDays ?? attendance?.absenceDays ?? 0;
    const tardinessMinutes = entry.tardinessMinutes ?? attendance?.tardinessMinutes ?? 0;
    const penaltyDays = attendance?.absencePenaltyDays ?? 0;
    const permissionDaysRecorded = entry.permissionDays ?? attendance?.permissionDays ?? 0;
    const rawPermissionHours = entry.permissionHours ?? attendance?.permissionHours ?? 0;
    let permissionDaysForCalc = permissionDaysRecorded;
    let permissionHoursBalance = Math.max(rawPermissionHours, 0);
    const extraPermissionDays = Math.floor(permissionHoursBalance / hoursPerDay);
    permissionDaysForCalc += extraPermissionDays;
    permissionHoursBalance -= extraPermissionDays * hoursPerDay;
    const tardinessHours = tardinessMinutes / 60;
    const recordedEligibleDays = typeof options.eligibleDaysOverride === 'number'
        ? options.eligibleDaysOverride
        : typeof attendance?.eligibleDays === 'number'
            ? attendance.eligibleDays
            : typeof breakdown?.eligibleDays === 'number'
                ? breakdown.eligibleDays
                : undefined;
    const initialGapDays = typeof options.initialGapDays === 'number' && Number.isFinite(options.initialGapDays)
        ? Math.max(options.initialGapDays, 0)
        : 0;
    const deductionDays = absenceDays + permissionDaysForCalc + penaltyDays + initialGapDays;
    const deductionHours = permissionHoursBalance + tardinessHours;
    const netDaysFrom = (total) => Math.max(total - deductionDays - deductionHours / hoursPerDay, 0);
    let netDays = netDaysFrom(baseDays);
    if (typeof recordedEligibleDays === 'number' && Number.isFinite(recordedEligibleDays)) {
        netDays = Math.min(recordedEligibleDays, netDays);
    }
    const netDaysDisplay = netDaysFrom(displayDays);
    const display = displayDays > 0
        ? `${formatDaysWithHours(netDaysDisplay, hoursPerDay)} / ${displayDays}`
        : formatDaysWithHours(netDaysDisplay, hoursPerDay);
    const fallbackEligibleDays = typeof recordedEligibleDays === 'number' && Number.isFinite(recordedEligibleDays)
        ? Math.max(recordedEligibleDays, 0)
        : null;
    if ((!Number.isFinite(workedDays) || workedDays <= 0) && fallbackEligibleDays !== null) {
        workedDays = Math.max(fallbackEligibleDays - (absenceDays + permissionDaysForCalc + penaltyDays), 0);
    }
    return {
        baseDays,
        displayDays,
        hoursPerDay,
        netDays,
        netDaysDisplay,
        display,
        permissionDaysRecorded,
        rawPermissionHours,
        tardinessMinutes,
        absenceDays,
        workedDays,
        penaltyDays,
    };
};
const formatIsoDate = (value) => {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleDateString('es-PE', { timeZone: 'UTC' });
};
const formatIsoDateShort = (value) => {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
};
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatDateParts = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const toInputDate = (date) => {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    return formatDateParts(year, month, day);
};
const todayString = () => toInputDate(new Date());
const monthKeyFromDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const parseMonthKey = (key) => {
    const [y, m] = key.split('-').map(Number);
    const now = new Date();
    const year = Number.isFinite(y) ? y : now.getFullYear();
    const month = Number.isFinite(m) ? Math.min(Math.max(m, 1), 12) : now.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const start = formatDateParts(year, month, 1);
    const end = formatDateParts(year, month, daysInMonth);
    return {
        start,
        end,
        label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const parseDateParts = (value) => {
    if (!value)
        return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match)
        return null;
    const [, yearStr, monthStr, dayStr] = match;
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day))
        return null;
    return { year, month, day };
};
const countInclusiveDays = (start, end) => {
    const startParts = parseDateParts(start);
    const endParts = parseDateParts(end);
    if (!startParts || !endParts)
        return null;
    const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
    const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
    if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc < startUtc)
        return null;
    return Math.floor((endUtc - startUtc) / MS_PER_DAY) + 1;
};
const getPeriodDayCount = (period) => {
    const configured = typeof period?.workingDays === 'number' && period.workingDays > 0
        ? Math.min(Math.max(Math.round(period.workingDays), 1), 30)
        : null;
    if (configured)
        return configured;
    const counted = countInclusiveDays(period?.startDate, period?.endDate);
    if (typeof counted === 'number' && counted > 0)
        return counted;
    return 30;
};
const getEntryEligibilityInfo = (entry, period, attendance) => {
    const periodDayCount = getPeriodDayCount(period);
    const periodStartParts = parseDateParts(period?.startDate);
    const periodEndParts = parseDateParts(period?.endDate);
    if (!periodStartParts || !periodEndParts) {
        return { periodDayCount, eligibleDays: periodDayCount, gapDays: 0 };
    }
    const periodStartUtc = Date.UTC(periodStartParts.year, periodStartParts.month - 1, periodStartParts.day);
    const periodEndUtc = Date.UTC(periodEndParts.year, periodEndParts.month - 1, periodEndParts.day);
    if (!Number.isFinite(periodStartUtc) || !Number.isFinite(periodEndUtc) || periodEndUtc < periodStartUtc) {
        return { periodDayCount, eligibleDays: periodDayCount, gapDays: 0 };
    }
    const startRaw = attendance?.startDate ?? entry.employee?.startDate ?? attendance?.periodStart ?? null;
    const startParts = parseDateParts(startRaw);
    if (!startParts) {
        return { periodDayCount, eligibleDays: periodDayCount, gapDays: 0 };
    }
    const entryStartUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
    if (!Number.isFinite(entryStartUtc) || entryStartUtc > periodEndUtc) {
        return { periodDayCount, eligibleDays: 0, gapDays: periodDayCount };
    }
    const effectiveStart = Math.max(entryStartUtc, periodStartUtc);
    const eligibleDays = Math.max(Math.floor((periodEndUtc - effectiveStart) / MS_PER_DAY) + 1, 0);
    const gapDays = Math.max(periodDayCount - eligibleDays, 0);
    return { periodDayCount, eligibleDays, gapDays };
};
const defaultEmployeeForm = () => ({
    firstName: '',
    lastName: '',
    documentNumber: '',
    position: '',
    baseSalary: '',
    bankType: 'BCP',
    accountNumber: '',
    cci: '',
    phone: '',
    pensionSystem: 'ONP',
    pensionRate: '0.13',
    healthRate: '0.09',
    startDate: todayString(),
    absenceSundayPenalty: false,
    area: 'OPERATIVE',
});
const defaultAttendanceForm = (employees) => ({
    employeeId: employees.length ? String(employees[0].id) : '',
    date: todayString(),
    status: 'PRESENT',
    minutesLate: '0',
    permissionHours: '0',
    extraHours: '0',
    permissionPaid: 'unpaid',
    holidayCount: '0',
    notes: '',
});
const defaultAdjustmentForm = () => ({
    entryId: '',
    type: 'BONUS',
    concept: '',
    amount: '',
});
const defaultPeriodForm = () => {
    const now = new Date();
    return {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        workingDays: 30,
        notes: '',
        fixedThirtyDays: true,
    };
};
const parseApiError = (error, fallback) => {
    const defaultMessage = fallback;
    if (error instanceof Error) {
        const raw = error.message?.trim() ?? '';
        if (!raw)
            return defaultMessage;
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string')
                return parsed;
            if (parsed && typeof parsed === 'object') {
                if ('detail' in parsed && typeof parsed.detail === 'string') {
                    return parsed.detail;
                }
                if ('error' in parsed && typeof parsed.error === 'string') {
                    return parsed.error;
                }
                if ('message' in parsed && typeof parsed.message === 'string') {
                    return parsed.message;
                }
            }
        }
        catch {
            /* ignore JSON parse errors */
        }
        if (/duplicad/i.test(raw)) {
            return 'El código o documento ya existe.';
        }
        return raw;
    }
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    return defaultMessage;
};
const prettyStatus = (status) => {
    switch (status) {
        case 'PRESENT': return 'Asistencia';
        case 'TARDY': return 'Tardanza';
        case 'ABSENT': return 'Falta';
        case 'PERMISSION': return 'Permiso';
        default: return status;
    }
};
const ATTENDANCE_STATUS_OPTIONS = ATTENDANCE_OPTIONS.map(option => ({ value: option, label: prettyStatus(option) }));
const employeeName = (employee) => employee ? `${employee.lastName} ${employee.firstName}`.trim() : '—';
export default function PersonnelPage() {
    const [tab, setTab] = useState('employees');
    const [obras, setObras] = useState([]);
    const [obraId, setObraId] = useState('');
    const [employees, setEmployees] = useState([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeeAlert, setEmployeeAlert] = useState(null);
    const [employeeForm, setEmployeeForm] = useState(() => defaultEmployeeForm());
    const deleteUnlocked = useDeleteAuth();
    const [attendance, setAttendance] = useState([]);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [attendanceAlert, setAttendanceAlert] = useState(null);
    const [attendanceMonth, setAttendanceMonth] = useState(() => monthKeyFromDate(new Date()));
    const [attendanceEmployeeFilter, setAttendanceEmployeeFilter] = useState('');
    const [attendanceForm, setAttendanceForm] = useState(() => defaultAttendanceForm([]));
    const [periods, setPeriods] = useState([]);
    const [periodsLoading, setPeriodsLoading] = useState(false);
    const [periodAlert, setPeriodAlert] = useState(null);
    const [periodForm, setPeriodForm] = useState(() => defaultPeriodForm());
    const [editingPeriodId, setEditingPeriodId] = useState(null);
    const [selectedPeriodId, setSelectedPeriodId] = useState(null);
    const [periodDetails, setPeriodDetails] = useState(null);
    const [periodDetailsCache, setPeriodDetailsCache] = useState({});
    const [entryForm, setEntryForm] = useState(() => defaultAdjustmentForm());
    const [entryAlert, setEntryAlert] = useState(null);
    const [accumulationLoading, setAccumulationLoading] = useState(false);
    const [periodEntrySearch, setPeriodEntrySearch] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeAreaFilter, setEmployeeAreaFilter] = useState('ALL');
    const [reportAreaFilter, setReportAreaFilter] = useState('ALL');
    const [bankFilter, setBankFilter] = useState('ALL');
    const [showAreaReport, setShowAreaReport] = useState(false);
    const [showBankReport, setShowBankReport] = useState(false);
    const [accumulationSelection, setAccumulationSelection] = useState([]);
    const [accumulationPayments, setAccumulationPayments] = useState({});
    const [accumulationPaymentSaving, setAccumulationPaymentSaving] = useState({});
    const [accumulationPaymentAlert, setAccumulationPaymentAlert] = useState(null);
    const [accumulationPaymentFilter, setAccumulationPaymentFilter] = useState('ALL');
    const [accumulationAccountFilter, setAccumulationAccountFilter] = useState('ALL');
    const filteredEmployees = useMemo(() => employeeAreaFilter === 'ALL'
        ? employees
        : employees.filter(emp => (emp.area ?? 'OPERATIVE') === employeeAreaFilter), [employeeAreaFilter, employees]);
    const employeesById = useMemo(() => {
        const result = new Map();
        employees.forEach(emp => result.set(emp.id, emp));
        return result;
    }, [employees]);
    const periodEntries = periodDetails?.entries ?? [];
    const filteredPeriodEntries = useMemo(() => {
        const term = periodEntrySearch.trim().toLowerCase();
        if (!term)
            return periodEntries;
        return periodEntries.filter(entry => employeeName(entry.employee).toLowerCase().includes(term));
    }, [periodEntries, periodEntrySearch]);
    const refreshEmployees = useCallback(async (obra) => {
        try {
            setEmployeesLoading(true);
            const res = await personnelApi.employees.list({
                obraId: typeof obra === 'number' ? obra : undefined,
                active: true,
            });
            setEmployees(res.items ?? []);
        }
        catch (error) {
            setEmployeeAlert(parseApiError(error, 'No se pudo registrar al trabajador.'));
        }
        finally {
            setEmployeesLoading(false);
        }
    }, []);
    const refreshAttendance = useCallback(async (obra, employeeOverride) => {
        try {
            setAttendanceLoading(true);
            const range = parseMonthKey(attendanceMonth);
            const overrideId = typeof employeeOverride === 'number' ? employeeOverride : undefined;
            const selectedEmployeeId = overrideId ??
                (typeof attendanceEmployeeFilter === 'number' ? attendanceEmployeeFilter : undefined);
            const res = await personnelApi.attendance.list({
                obraId: typeof obra === 'number' ? obra : undefined,
                employeeId: selectedEmployeeId,
                from: range.start,
                to: range.end,
            });
            setAttendance(res.items ?? []);
        }
        catch (error) {
            setAttendanceAlert(error instanceof Error ? error.message : String(error));
        }
        finally {
            setAttendanceLoading(false);
        }
    }, [attendanceMonth, attendanceEmployeeFilter]);
    const handleEmployeeAreaFilterChange = useCallback((next) => {
        setEmployeeAreaFilter(next);
    }, []);
    const refreshPeriods = useCallback(async (obra) => {
        try {
            setPeriodsLoading(true);
            const res = await personnelApi.periods.list({
                obraId: typeof obra === 'number' ? obra : undefined,
            });
            setPeriods(res.items ?? []);
        }
        catch (error) {
            setPeriodAlert(error instanceof Error ? error.message : String(error));
        }
        finally {
            setPeriodsLoading(false);
        }
    }, []);
    const loadPeriodDetails = useCallback(async (periodId) => {
        try {
            if (periodDetailsCache[periodId]) {
                setPeriodDetails(periodDetailsCache[periodId]);
                return;
            }
            const period = await personnelApi.periods.get(periodId);
            setPeriodDetails(period);
            setPeriodDetailsCache(prev => ({ ...prev, [periodId]: period }));
            setEntryForm(() => {
                const next = defaultAdjustmentForm();
                if (period.entries[0]) {
                    next.entryId = String(period.entries[0].id);
                }
                return next;
            });
        }
        catch (error) {
            setPeriodAlert(error instanceof Error ? error.message : String(error));
        }
    }, [periodDetailsCache]);
    useEffect(() => {
        (async () => {
            try {
                const obrasList = await api.get('/obras');
                setObras(obrasList);
                if (!obraId && obrasList.length) {
                    setObraId(obrasList[0].id);
                }
            }
            catch (error) {
                setEmployeeAlert(parseApiError(error, 'No se pudo cargar la información inicial.'));
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const currentObra = typeof obraId === 'number' ? obraId : undefined;
        refreshEmployees(currentObra);
        refreshPeriods(currentObra);
    }, [obraId, refreshEmployees, refreshPeriods]);
    useEffect(() => {
        const currentObra = typeof obraId === 'number' ? obraId : undefined;
        refreshAttendance(currentObra);
    }, [obraId, attendanceMonth, refreshAttendance]);
    useEffect(() => {
        setAttendanceForm(defaultAttendanceForm(employees));
        if (selectedEmployeeId !== '' && !employees.some(emp => emp.id === selectedEmployeeId)) {
            setSelectedEmployeeId('');
        }
    }, [employees, selectedEmployeeId]);
    const sortedPeriodsDesc = useMemo(() => [...periods].sort((a, b) => {
        if (a.year !== b.year)
            return b.year - a.year;
        return b.month - a.month;
    }), [periods]);
    const accumulationOptions = useMemo(() => sortedPeriodsDesc.slice(0, 12), [sortedPeriodsDesc]);
    const startOfCurrentMonth = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }, []);
    const defaultPaidPeriods = useMemo(() => {
        const eligible = sortedPeriodsDesc.filter(period => {
            const periodDate = new Date(period.year, period.month - 1, 1);
            return periodDate < startOfCurrentMonth;
        });
        if (eligible.length) {
            return eligible.slice(0, DEFAULT_ACCUMULATION_MONTHS).map(period => period.id);
        }
        return sortedPeriodsDesc.slice(0, DEFAULT_ACCUMULATION_MONTHS).map(period => period.id);
    }, [sortedPeriodsDesc, startOfCurrentMonth]);
    useEffect(() => {
        if (!periods.length) {
            setAccumulationSelection([]);
            return;
        }
        setAccumulationSelection(prev => {
            if (prev.length) {
                const valid = prev.filter(id => periods.some(period => period.id === id));
                if (valid.length === prev.length)
                    return prev;
                if (valid.length)
                    return valid;
            }
            const defaults = defaultPaidPeriods.length
                ? defaultPaidPeriods
                : sortedPeriodsDesc.slice(0, DEFAULT_ACCUMULATION_MONTHS).map(period => period.id);
            return defaults;
        });
    }, [periods, sortedPeriodsDesc, defaultPaidPeriods]);
    const accumulationPeriods = useMemo(() => {
        if (!accumulationSelection.length)
            return [];
        const byId = new Map(periods.map(period => [period.id, period]));
        return accumulationSelection
            .map(id => byId.get(id))
            .filter((period) => Boolean(period))
            .sort((a, b) => {
            if (a.year !== b.year)
                return a.year - b.year;
            return a.month - b.month;
        });
    }, [accumulationSelection, periods]);
    useEffect(() => {
        if (!accumulationPeriods.length)
            return;
        const missing = accumulationPeriods.filter(period => !periodDetailsCache[period.id]);
        if (!missing.length)
            return;
        let cancelled = false;
        setAccumulationLoading(true);
        (async () => {
            try {
                const fetched = await Promise.all(missing.map(period => personnelApi.periods.get(period.id)));
                if (cancelled)
                    return;
                setPeriodDetailsCache(prev => {
                    const next = { ...prev };
                    fetched.forEach(period => {
                        next[period.id] = period;
                    });
                    return next;
                });
            }
            catch (error) {
                if (!cancelled) {
                    setEntryAlert(parseApiError(error, 'No se pudo calcular el acumulado histórico.'));
                }
            }
            finally {
                if (!cancelled)
                    setAccumulationLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [accumulationPeriods, periodDetailsCache]);
    const toggleAccumulationPeriod = useCallback((periodId) => {
        setAccumulationSelection(prev => {
            const exists = prev.includes(periodId);
            if (exists)
                return prev.filter(id => id !== periodId);
            if (prev.length >= MAX_ACCUMULATION_MONTHS) {
                setEntryAlert(`Selecciona como máximo ${MAX_ACCUMULATION_MONTHS} periodos para el acumulado.`);
                return prev;
            }
            return [...prev, periodId];
        });
    }, [setEntryAlert]);
    const handleSelectLatestPeriods = useCallback(() => {
        if (!sortedPeriodsDesc.length)
            return;
        const defaults = defaultPaidPeriods.length
            ? defaultPaidPeriods
            : sortedPeriodsDesc.slice(0, DEFAULT_ACCUMULATION_MONTHS).map(period => period.id);
        setAccumulationSelection(defaults);
    }, [defaultPaidPeriods, sortedPeriodsDesc]);
    const refreshAccumulationPayments = useCallback(async () => {
        try {
            const response = await personnelApi.accumulationPayments.list();
            const map = {};
            response.items.forEach(item => {
                map[item.employeeId] = item.paid;
            });
            setAccumulationPayments(map);
        }
        catch (error) {
            setAccumulationPaymentAlert(parseApiError(error, 'No se pudo cargar el estado de pago.'));
        }
    }, []);
    useEffect(() => {
        refreshAccumulationPayments();
    }, [refreshAccumulationPayments]);
    const handleAccumulationPaymentChange = useCallback(async (employeeId, paid) => {
        setAccumulationPaymentAlert(null);
        setAccumulationPaymentSaving(prev => ({ ...prev, [employeeId]: true }));
        try {
            const payload = { paid };
            if (!paid) {
                const password = getDeletePassword();
                if (!password) {
                    throw new Error('Desbloquea Seguridad para modificar pagos confirmados.');
                }
                payload.adminPassword = password;
            }
            const response = await personnelApi.accumulationPayments.update(employeeId, payload);
            setAccumulationPayments(prev => ({ ...prev, [employeeId]: response.paid }));
        }
        catch (error) {
            setAccumulationPaymentAlert(parseApiError(error, 'No se pudo actualizar el estado de pago.'));
        }
        finally {
            setAccumulationPaymentSaving(prev => {
                const next = { ...prev };
                delete next[employeeId];
                return next;
            });
        }
    }, []);
    const handleEmployeeFormChange = (key, value) => {
        setEmployeeForm(prev => ({ ...prev, [key]: value }));
    };
    const handleCreateEmployee = async (event) => {
        event.preventDefault();
        setEmployeeAlert(null);
        const baseSalary = Number(employeeForm.baseSalary);
        if (!employeeForm.firstName.trim() || !employeeForm.lastName.trim()) {
            setEmployeeAlert('Ingresa nombres y apellidos.');
            return;
        }
        if (Number.isNaN(baseSalary) || baseSalary <= 0) {
            setEmployeeAlert('El sueldo base debe ser un número mayor a 0.');
            return;
        }
        const payload = {
            firstName: employeeForm.firstName.trim(),
            lastName: employeeForm.lastName.trim(),
            documentNumber: employeeForm.documentNumber?.trim() || null,
            position: employeeForm.position?.trim() || null,
            baseSalary,
            bankType: employeeForm.bankType,
            accountNumber: employeeForm.accountNumber.trim() || null,
            cci: employeeForm.cci.trim() || null,
            phone: employeeForm.phone.trim() || null,
            pensionSystem: employeeForm.pensionSystem,
            pensionRate: Number(employeeForm.pensionRate) || 0,
            healthRate: Number(employeeForm.healthRate) || 0,
            obraId: typeof obraId === 'number' ? obraId : null,
            startDate: employeeForm.startDate || null,
            absenceSundayPenalty: employeeForm.absenceSundayPenalty,
            area: employeeForm.area,
        };
        try {
            if (typeof selectedEmployeeId === 'number') {
                await personnelApi.employees.update(selectedEmployeeId, payload);
                setEmployeeAlert('Trabajador actualizado.');
            }
            else {
                await personnelApi.employees.create(payload);
                setEmployeeAlert('Trabajador registrado con éxito.');
            }
            setEmployeeForm(defaultEmployeeForm());
            setSelectedEmployeeId('');
            refreshEmployees(obraId);
        }
        catch (error) {
            setEmployeeAlert(parseApiError(error, 'No se pudo registrar al trabajador.'));
        }
    };
    const toggleEmployeeActive = async (employee) => {
        try {
            await personnelApi.employees.update(employee.id, { isActive: !employee.isActive });
            refreshEmployees(obraId);
        }
        catch (error) {
            setEmployeeAlert(parseApiError(error, 'No se pudo actualizar el trabajador.'));
        }
    };
    const handleDeleteEmployee = useCallback(async (targetId) => {
        if (!deleteUnlocked) {
            window.alert('Desbloquea las eliminaciones en Seguridad antes de borrar trabajadores.');
            return;
        }
        const idToDelete = typeof targetId === 'number'
            ? targetId
            : typeof selectedEmployeeId === 'number'
                ? selectedEmployeeId
                : null;
        if (!idToDelete) {
            setEmployeeAlert('Selecciona un trabajador para eliminar.');
            return;
        }
        const employee = employees.find((emp) => emp.id === idToDelete);
        const fullName = employee ? employeeName(employee) : 'este trabajador';
        const confirmed = window.confirm(`¿Eliminar definitivamente a ${fullName}? Esta acción no se puede deshacer.`);
        if (!confirmed)
            return;
        try {
            await personnelApi.employees.delete(idToDelete);
            setEmployeeAlert('Trabajador eliminado.');
            setSelectedEmployeeId('');
            const currentObra = typeof obraId === 'number' ? obraId : undefined;
            await refreshEmployees(currentObra);
            await refreshAttendance(currentObra);
            await refreshPeriods(currentObra);
        }
        catch (error) {
            setEmployeeAlert(parseApiError(error, 'No se pudo eliminar al trabajador.'));
        }
    }, [deleteUnlocked, selectedEmployeeId, employees, obraId, refreshEmployees, refreshAttendance, refreshPeriods]);
    const handleEditEmployee = useCallback(async (employeeId) => {
        try {
            const employee = employees.find(emp => emp.id === employeeId);
            const data = employee ?? (await personnelApi.employees.get(employeeId));
            setEmployeeForm({
                firstName: data.firstName,
                lastName: data.lastName,
                documentNumber: data.documentNumber ?? '',
                position: data.position ?? '',
                baseSalary: String(data.baseSalary ?? ''),
                bankType: data.bankType ?? 'BCP',
                accountNumber: data.accountNumber ?? '',
                cci: data.cci ?? '',
                phone: data.phone ?? '',
                pensionSystem: data.pensionSystem ?? '',
                pensionRate: data.pensionRate != null ? String(data.pensionRate) : '',
                healthRate: data.healthRate != null ? String(data.healthRate) : '',
                startDate: data.startDate ? data.startDate.slice(0, 10) : '',
                absenceSundayPenalty: Boolean(data.absenceSundayPenalty),
                area: data.area ?? 'OPERATIVE',
            });
            setSelectedEmployeeId(employeeId);
            setEmployeeAlert('Edita los campos y guarda para actualizar.');
        }
        catch (error) {
            setEmployeeAlert(parseApiError(error, 'No se pudo cargar los datos del trabajador.'));
        }
    }, [employees]);
    const handleAttendanceFormChange = (key, value) => {
        setAttendanceForm(prev => ({ ...prev, [key]: value }));
    };
    const handleSaveAttendance = async (event) => {
        event.preventDefault();
        setAttendanceAlert(null);
        if (!attendanceForm.employeeId) {
            setAttendanceAlert('Selecciona un trabajador.');
            return;
        }
        const isPermissionPaid = attendanceForm.permissionPaid === 'paid';
        const holidayCount = Math.max(0, Math.floor(Number(attendanceForm.holidayCount) || 0));
        const payload = {
            employeeId: Number(attendanceForm.employeeId),
            date: attendanceForm.date,
            status: attendanceForm.status,
            holidayCount,
            holidayWorked: holidayCount > 0,
        };
        if (attendanceForm.status === 'TARDY') {
            payload.minutesLate = Number(attendanceForm.minutesLate) || 0;
        }
        if (attendanceForm.status === 'PERMISSION') {
            payload.permissionHours = Number(attendanceForm.permissionHours) || 0;
            payload.permissionPaid = isPermissionPaid;
        }
        else if (isPermissionPaid) {
            payload.permissionPaid = true;
        }
        payload.extraHours = Number(attendanceForm.extraHours) || 0;
        payload.notes = attendanceForm.notes?.trim() || null;
        try {
            await personnelApi.attendance.upsert(payload);
            refreshAttendance(obraId);
            setAttendanceAlert('Asistencia registrada.');
        }
        catch (error) {
            setAttendanceAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleDeleteAttendance = async (record) => {
        if (!deleteUnlocked) {
            window.alert('Desbloquea las eliminaciones en Seguridad antes de borrar asistencia.');
            return;
        }
        if (!window.confirm('¿Eliminar registro de asistencia?'))
            return;
        try {
            await personnelApi.attendance.remove(record.id);
            refreshAttendance(obraId);
        }
        catch (error) {
            setAttendanceAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleCancelPeriodEdit = () => {
        setEditingPeriodId(null);
        setPeriodForm(() => defaultPeriodForm());
    };
    const handleEditPeriod = (period) => {
        setEditingPeriodId(period.id);
        setPeriodAlert(null);
        setPeriodForm({
            month: period.month,
            year: period.year,
            workingDays: period.workingDays,
            notes: period.notes ?? '',
            fixedThirtyDays: period.workingDays === 30,
        });
    };
    const handleSubmitPeriod = async (event) => {
        event.preventDefault();
        try {
            const payload = {
                month: Number(periodForm.month),
                year: Number(periodForm.year),
                workingDays: Number(periodForm.workingDays) || 30,
                notes: periodForm.notes?.trim() || null,
                obraId: typeof obraId === 'number' ? obraId : null,
            };
            if (editingPeriodId) {
                await personnelApi.periods.update(editingPeriodId, payload);
                setPeriodAlert('Periodo actualizado.');
                refreshPeriods(obraId);
                if (selectedPeriodId === editingPeriodId) {
                    await loadPeriodDetails(editingPeriodId);
                }
                handleCancelPeriodEdit();
            }
            else {
                const period = await personnelApi.periods.create(payload);
                setPeriodAlert('Periodo creado.');
                refreshPeriods(obraId);
                setSelectedPeriodId(period.id);
                loadPeriodDetails(period.id);
            }
        }
        catch (error) {
            setPeriodAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleSelectPeriod = async (id) => {
        setSelectedPeriodId(id);
        setPeriodDetails(null);
        await loadPeriodDetails(id);
    };
    useEffect(() => {
        setPeriodEntrySearch('');
    }, [selectedPeriodId]);
    const handleGeneratePeriod = async (period) => {
        const isClosed = period.status === 'CLOSED';
        if (isClosed) {
            const confirmRecalc = window.confirm('El periodo está cerrado. ¿Deseas recalcular la planilla? Esto reabrirá el periodo para seguir editando.');
            if (!confirmRecalc)
                return;
        }
        try {
            await personnelApi.periods.generate(period.id, isClosed);
            setPeriodAlert('Planilla generada.');
            await loadPeriodDetails(period.id);
            refreshPeriods(obraId);
        }
        catch (error) {
            setPeriodAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleClosePeriod = async (periodId) => {
        if (!window.confirm('¿Cerrar periodo? No podrás editarlo luego.'))
            return;
        try {
            await personnelApi.periods.close(periodId);
            setPeriodAlert('Periodo cerrado.');
            refreshPeriods(obraId);
            await loadPeriodDetails(periodId);
        }
        catch (error) {
            setPeriodAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleAdjustmentFormChange = (key, value) => {
        setEntryForm(prev => {
            if (key === 'type') {
                const typedValue = value;
                const shouldPrefill = typedValue === 'ADVANCE' && (!prev.concept || prev.concept === 'Adelanto de sueldo');
                const shouldClear = typedValue !== 'ADVANCE' && prev.concept === 'Adelanto de sueldo';
                return {
                    ...prev,
                    type: typedValue,
                    concept: shouldPrefill ? 'Adelanto de sueldo' : shouldClear ? '' : prev.concept,
                };
            }
            return { ...prev, [key]: value };
        });
    };
    const handleAddAdjustment = async (event) => {
        event.preventDefault();
        if (!entryForm.entryId) {
            setEntryAlert('Selecciona una boleta.');
            return;
        }
        const amount = Number(entryForm.amount);
        if (!amount || amount <= 0) {
            setEntryAlert('Ingresa un monto válido.');
            return;
        }
        const concept = entryForm.type === 'ADVANCE' && !entryForm.concept.trim()
            ? 'Adelanto de sueldo'
            : entryForm.concept.trim();
        if (!concept) {
            setEntryAlert('Ingresa un concepto.');
            return;
        }
        const payload = {
            type: entryForm.type,
            concept,
            amount,
        };
        try {
            const entryId = Number(entryForm.entryId);
            await personnelApi.entries.addAdjustment(entryId, payload);
            setEntryAlert('Ajuste aplicado.');
            if (selectedPeriodId)
                await loadPeriodDetails(selectedPeriodId);
            setEntryForm(form => ({
                ...form,
                concept: form.type === 'ADVANCE' ? 'Adelanto de sueldo' : '',
                amount: '',
            }));
        }
        catch (error) {
            setEntryAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const handleDeleteAdjustment = async (adjustment) => {
        if (!window.confirm('¿Quitar ajuste?'))
            return;
        try {
            await personnelApi.entries.deleteAdjustment(adjustment.id);
            if (selectedPeriodId)
                await loadPeriodDetails(selectedPeriodId);
        }
        catch (error) {
            setEntryAlert(error instanceof Error ? error.message : String(error));
        }
    };
    const buildPayrollSlip = useCallback((entry, period) => {
        const breakdown = (entry.details?.breakdown ?? {});
        const attendance = (entry.details?.attendance ?? {});
        const eligibility = getEntryEligibilityInfo(entry, period, attendance);
        const dayInfo = computePayrollDayInfo(entry, breakdown, attendance, {
            baseDays: eligibility.periodDayCount,
            displayDaysFallback: eligibility.periodDayCount,
            initialGapDays: eligibility.gapDays,
            eligibleDaysOverride: eligibility.eligibleDays,
        });
        const monthlyBase = breakdown?.monthlyBase ?? entry.baseSalary;
        const proratedBase = entry.baseSalary ?? monthlyBase;
        const dailyRate = breakdown?.dailyRate ?? entry.dailyRate ?? null;
        const remuneration = proratedBase;
        const overtime = breakdown?.overtimeBonus ?? 0;
        const feriados = breakdown?.holidayBonus ?? entry.holidayBonus ?? 0;
        const otherBonuses = breakdown?.manualBonuses ?? 0;
        const weekendSundayDays = attendance?.weekendSundayDays ?? 0;
        const weekendSundayBonus = breakdown?.weekendSundayBonus ?? 0;
        const faltas = breakdown?.absenceDeduction ?? 0;
        const permisos = breakdown?.permissionDeduction ?? 0;
        const adelantos = breakdown?.manualAdvances ?? 0;
        const otrasPenalidades = Math.max(0, (breakdown?.manualDeductions ?? 0) - adelantos);
        const penalidades = otrasPenalidades + (breakdown?.tardinessDeduction ?? 0);
        const pension = entry.pensionAmount ?? 0;
        const essalud = entry.healthAmount ?? 0;
        const startDate = attendance?.startDate ?? entry.employee?.startDate ?? null;
        const holidayDays = entry.holidayDays ?? attendance?.holidayDays ?? 0;
        const hoursPerDay = dayInfo.hoursPerDay > 0 ? dayInfo.hoursPerDay : HOURS_PER_DAY_DEFAULT;
        const overtimeHours = attendance?.overtimeHours ?? 0;
        const overtimeHoursText = formatHoursOrZero(overtimeHours);
        const baseDayRate = dailyRate && dailyRate > 0
            ? dailyRate
            : monthlyBase && dayInfo.baseDays > 0
                ? monthlyBase / dayInfo.baseDays
                : null;
        const netBaseAmount = Math.max(remuneration - faltas - permisos - penalidades, 0);
        const paidDaysNet = baseDayRate && baseDayRate > 0 ? netBaseAmount / baseDayRate : dayInfo.workedDays ?? dayInfo.netDaysDisplay;
        const paidDaysLine = formatDaysWithPartialHours(paidDaysNet, 0, hoursPerDay);
        const generatedDaysText = paidDaysLine;
        const periodEligibleDays = eligibility.eligibleDays ?? dayInfo.baseDays;
        const periodBaseText = formatDaysAndExplicitHours(periodEligibleDays, hoursPerDay);
        const unpaidDifference = Math.max(periodEligibleDays - normalizeQuantity(paidDaysNet, 1e-2), 0);
        const permissionTotalDaysRaw = Math.max(dayInfo.permissionDaysRecorded + dayInfo.rawPermissionHours / hoursPerDay, 0);
        const permissionTotalDays = normalizeQuantity(permissionTotalDaysRaw, hoursPerDay * 0.05);
        const permitAbsenceAmount = faltas + permisos;
        const hasUnpaidPermission = normalizeQuantity(permitAbsenceAmount, 0.01) > 0;
        const derivedPermissionDays = normalizeQuantity(unpaidDifference, hoursPerDay * 0.05);
        let permissionDisplayDays = permissionTotalDays ?? 0;
        if (!hasUnpaidPermission) {
            permissionDisplayDays = 0;
        }
        else if (permissionDisplayDays > 0 && derivedPermissionDays > 0) {
            permissionDisplayDays = Math.min(permissionDisplayDays, derivedPermissionDays);
        }
        const permissionDisplay = formatDaysWithHours(permissionDisplayDays, hoursPerDay);
        const tardinessHoursText = formatHoursOrZero(dayInfo.tardinessMinutes / 60);
        const sundayPenaltyDays = dayInfo.penaltyDays ?? 0;
        const tardinessLabel = `${dayInfo.tardinessMinutes} min (${tardinessHoursText})`;
        const feriadoLabel = `${holidayDays} ${holidayDays === 1 ? 'día' : 'días'}`;
        const domingoLabel = `${weekendSundayDays} ${weekendSundayDays === 1 ? 'día' : 'días'}`;
        const pensionLabel = entry.employee?.pensionSystem
            ? PENSION_SYSTEM_OPTIONS.find(opt => opt.value === entry.employee?.pensionSystem)?.label ?? 'Pensión'
            : 'Pensión';
        const absenceLabelBase = `${dayInfo.absenceDays} ${dayInfo.absenceDays === 1 ? 'día' : 'días'}`;
        const absenceLabelExtra = sundayPenaltyDays > 0 ? ` · +${sundayPenaltyDays} domingo${sundayPenaltyDays === 1 ? '' : 's'} descontado${sundayPenaltyDays === 1 ? '' : 's'}` : '';
        const permitAbsenceLabel = `${absenceLabelBase}${absenceLabelExtra} · ${hasUnpaidPermission ? permissionDisplay : formatDaysWithHours(0, hoursPerDay)}`;
        const bonusSpecialsAmount = feriados + weekendSundayBonus + otherBonuses;
        const bonusSpecialsDetailParts = [];
        if (holidayDays > 0)
            bonusSpecialsDetailParts.push(`Feriados ${feriadoLabel}`);
        if (weekendSundayDays > 0)
            bonusSpecialsDetailParts.push(`Domingos ${domingoLabel}`);
        if (otherBonuses > 0)
            bonusSpecialsDetailParts.push('Bonos manuales');
        const bonusSpecialsDetail = bonusSpecialsDetailParts.length ? bonusSpecialsDetailParts.join(' · ') : '—';
        const contributionsAmount = pension + essalud;
        const contributionsDetailParts = [];
        if (pension > 0)
            contributionsDetailParts.push(pensionLabel);
        if (essalud > 0)
            contributionsDetailParts.push('Essalud');
        const contributionsDetail = contributionsDetailParts.length ? contributionsDetailParts.join(' + ') : '—';
        const earningsRows = [
            { label: 'Remuneración consolidada', detail: generatedDaysText, amount: remuneration, always: true },
            { label: 'Horas extras', detail: overtimeHoursText, amount: overtime },
            { label: 'Bonos especiales', detail: bonusSpecialsDetail, amount: bonusSpecialsAmount },
        ].filter(row => row.always || (row.amount ?? 0) > 0);
        const deductionsRows = [
            { label: 'Permisos / faltas', detail: permitAbsenceLabel, amount: permitAbsenceAmount, always: permitAbsenceAmount > 0 },
            { label: 'Adelantos', detail: 'Pagos adelantados registrados', amount: adelantos },
            { label: 'Penalidades / tardanzas', detail: 'Descuentos automáticos', amount: penalidades },
            { label: 'Aportes', detail: contributionsDetail, amount: contributionsAmount },
        ].filter(row => row.always || (row.amount ?? 0) > 0);
        const earningsRowsHtml = earningsRows
            .map(row => `
        <tr>
          <td>${row.label}</td>
          <td class="detail">${row.detail}</td>
          <td class="amount"><span>${currency(row.amount)}</span></td>
        </tr>`)
            .join('') || '<tr><td colspan="3">Sin haberes adicionales.</td></tr>';
        const deductionsRowsHtml = deductionsRows
            .map(row => `
        <tr>
          <td>${row.label}</td>
          <td class="detail">${row.detail}</td>
          <td class="amount"><span>${currency(row.amount)}</span></td>
        </tr>`)
            .join('') || '<tr><td colspan="3">Sin descuentos registrados.</td></tr>';
        const fullName = employeeName(entry.employee);
        const dni = entry.employee?.documentNumber ?? '—';
        const cargo = entry.employee?.position ?? '—';
        const ingreso = formatIsoDate(startDate ?? null);
        const mesLabel = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
        const periodRange = `${formatIsoDateShort(period.startDate)} - ${formatIsoDateShort(period.endDate)}`;
        const safeFullName = escapeHtml(fullName);
        const safeCargo = escapeHtml(cargo);
        const safeDni = escapeHtml(dni);
        const safeIngreso = escapeHtml(ingreso);
        const safeMes = escapeHtml(mesLabel);
        const safePeriodRange = escapeHtml(periodRange);
        return `
<section class="payroll-slip">
  <div class="header">
    <div>
      <div class="project">PROYECTO</div>
      <div class="project">LA CARBONERA</div>
    </div>
    <div class="title">BOLETA DE PAGO</div>
    <div class="subtitle">
      <div><strong>CONSORCIO PACÍFICO</strong></div>
      <div>RUC 20611482796</div>
      <div>BOLETA N° 001</div>
    </div>
  </div>
  <div class="box">
    <div><strong>DNI:</strong> ${safeDni}</div>
    <div><strong>Cargo:</strong> ${safeCargo}</div>
    <div><strong>Apellidos y Nombres:</strong> ${safeFullName}</div>
    <div><strong>Fecha de ingreso:</strong> ${safeIngreso}</div>
    <div><strong>Mes/Año:</strong> ${safeMes}</div>
    <div><strong>Periodo:</strong> ${safePeriodRange}</div>
  </div>
  <div class="box">
    <h4>Resumen del periodo</h4>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="label">Sueldo mensual / Prorrateado</div>
        <div class="value">${currency(monthlyBase)} · ${currency(proratedBase)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Días trabajados y pagados</div>
        <div class="value">${paidDaysLine}</div>
      </div>
      <div class="summary-item">
        <div class="label">Base del periodo</div>
        <div class="value">${periodBaseText}</div>
      </div>
      <div class="summary-item">
        <div class="label">Fecha de ingreso</div>
        <div class="value">${safeIngreso}</div>
      </div>
      <div class="summary-item">
        <div class="label">Permisos sin goce</div>
        <div class="value">${permissionDisplay}</div>
      </div>
      <div class="summary-item">
        <div class="label">Faltas registradas</div>
        <div class="value">
          ${dayInfo.absenceDays} ${dayInfo.absenceDays === 1 ? 'día' : 'días'}
          ${sundayPenaltyDays > 0 ? `<span class="extra-note">Dominicales descontados: ${sundayPenaltyDays}</span>` : ''}
        </div>
      </div>
      <div class="summary-item">
        <div class="label">Tardanzas</div>
        <div class="value">${tardinessLabel}</div>
      </div>
      <div class="summary-item">
        <div class="label">Horas extras</div>
        <div class="value">${overtimeHoursText}</div>
      </div>
      <div class="summary-item">
        <div class="label">Feriados trabajados</div>
        <div class="value">${feriadoLabel} · Bono ${currency(entry.holidayBonus ?? 0)}</div>
      </div>
      <div class="summary-item">
        <div class="label">Domingos trabajados</div>
        <div class="value">${domingoLabel}</div>
      </div>
    </div>
  </div>
  <div class="box">
    <div class="comp-columns">
      <div class="comp-box">
        <h4>Haberes percibidos</h4>
        <table class="comp-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Detalle</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${earningsRowsHtml}
          </tbody>
        </table>
      </div>
      <div class="comp-box">
        <h4>Descuentos</h4>
        <table class="comp-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Detalle</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${deductionsRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="box net">Neto a pagar: ${currency(entry.netPay)}</div>
  <div class="box signatures">
    <div class="sign">
      <div class="line"></div>
      <div>Firma del Empleador</div>
    </div>
    <div class="sign">
      <div class="line"></div>
      <div>Firma del Colaborador</div>
    </div>
  </div>
</section>
`;
    }, []);
    const summarizeEntry = useCallback((entry) => {
        if (!periodDetails)
            return null;
        const breakdown = (entry.details?.breakdown ?? {});
        const attendance = (entry.details?.attendance ?? {});
        const monthlyBase = breakdown?.monthlyBase ?? entry.baseSalary;
        const startDate = attendance?.startDate ?? entry.employee?.startDate ?? null;
        const manualAdvances = breakdown?.manualAdvances ?? 0;
        const manualDeductions = Math.max(0, (breakdown?.manualDeductions ?? 0) - manualAdvances);
        const eligibility = getEntryEligibilityInfo(entry, periodDetails, attendance);
        const dayInfo = computePayrollDayInfo(entry, breakdown, attendance, {
            baseDays: eligibility.periodDayCount,
            displayDaysFallback: eligibility.periodDayCount,
            initialGapDays: eligibility.gapDays,
            eligibleDaysOverride: eligibility.eligibleDays,
        });
        const weekendSundayDays = attendance?.weekendSundayDays ?? 0;
        const weekendSundayBonus = breakdown?.weekendSundayBonus ?? 0;
        const faltas = breakdown?.absenceDeduction ?? 0;
        const permisos = breakdown?.permissionDeduction ?? 0;
        const actualDeductions = Math.max(faltas + permisos + (breakdown?.tardinessDeduction ?? 0) + manualDeductions, 0);
        return {
            remuneration: entry.baseSalary ?? monthlyBase ?? 0,
            overtime: breakdown?.overtimeBonus ?? 0,
            feriados: breakdown?.holidayBonus ?? entry.holidayBonus ?? 0,
            weekendSundayBonus,
            manualBonuses: breakdown?.manualBonuses ?? 0,
            faltas: breakdown?.absenceDeduction ?? 0,
            permisos: breakdown?.permissionDeduction ?? 0,
            tardiness: breakdown?.tardinessDeduction ?? 0,
            manualDeductions,
            manualAdvances,
            attendance,
            breakdown,
            monthlyBase,
            proratedBase: entry.baseSalary ?? monthlyBase,
            daysDisplay: dayInfo.display,
            startDate,
            workedDays: dayInfo.workedDays,
            absenceDays: dayInfo.absenceDays,
            tardinessMinutes: dayInfo.tardinessMinutes,
            permissionDaysRecorded: dayInfo.permissionDaysRecorded,
            permissionHours: dayInfo.rawPermissionHours,
            holidayDays: entry.holidayDays ?? attendance?.holidayDays ?? 0,
            holidayBonus: entry.holidayBonus ?? 0,
            weekendSundayDays,
            actualDeductions,
        };
    }, [periodDetails]);
    const renderPrintDocument = (sections, title, options) => {
        const safeTitle = escapeHtml(title);
        const orientation = options?.orientation ?? 'portrait';
        const pageWidth = orientation === 'landscape' ? '277mm' : '190mm';
        const pages = sections.join('\n<div class="slip-gap"></div>\n');
        return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 10mm; }
    body { font-family: Arial, sans-serif; margin: 0 auto; width: ${pageWidth}; padding: 10mm 0; color: #1f2937; }
    .slip-gap { height: 6mm; }
    .payroll-slip { page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 0 auto; max-width: 190mm; }
    .area-report { page-break-inside: avoid; margin-bottom: 24px; }
    .area-report h2 { font-size: 18px; margin: 0 0 12px 0; }
    .area-report table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .area-report th, .area-report td { border: 1px solid #cbd5f5; padding: 6px; text-align: left; vertical-align: top; }
    .area-report th { background-color: #e2e8f0; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
    .area-report .totals-row td { font-weight: 700; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; }
    .project { font-size: 12px; font-weight: 600; }
    .title { font-size: 20px; font-weight: 700; text-align: center; flex: 1; }
    .subtitle { text-align: right; font-size: 12px; }
    .box { border: 1px solid #cbd5e1; padding: 10px 12px; margin-top: 12px; border-radius: 6px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
    .summary-grid.summary-compact { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .summary-item {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 8px;
      background-color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      min-height: 48px;
    }
    .summary-item .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; margin-bottom: 2px; text-align: center; }
    .summary-item .value { font-size: 13px; font-weight: 600; color: #0f172a; text-align: center; }
    .summary-item .extra-note { display: block; font-size: 11px; color: #475569; font-weight: 400; margin-top: 2px; }
    .columns { display: flex; gap: 24px; }
    .col { flex: 1; }
    .comp-columns { display: flex; flex-direction: column; gap: 16px; }
    @media print {
      .comp-columns { flex-direction: row; }
    }
    .comp-box { flex: 1; }
    h4 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; }
    ul { margin: 0; padding-left: 16px; font-size: 12px; }
    .detail-list { list-style: none; padding-left: 0; margin: 0; font-size: 12px; }
    .detail-list li { margin-bottom: 4px; }
    .comp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    .comp-table th, .comp-table td { border: 1px solid #e2e8f0; padding: 6px 8px; }
    .comp-table th { background-color: #f1f5f9; text-align: left; color: #475569; font-size: 11px; letter-spacing: 0.04em; }
    .comp-table td.detail { font-size: 11px; color: #475569; }
    .comp-table td.amount { text-align: right; font-weight: 600; color: #0f172a; white-space: nowrap; }
    .comp-table td.amount span { display: inline-block; }
    .net { font-size: 14px; font-weight: 700; text-align: center; margin-top: 12px; }
    .signatures { display: flex; justify-content: space-between; margin-top: 24px; gap: 40px; }
    .sign { flex: 1; text-align: center; font-size: 12px; }
    .sign .line { border-top: 1px solid #1f2937; margin-bottom: 8px; margin-top: 32px; }
    .page-break { page-break-after: always; }
  </style>
</head>
<body>
${pages}
</body>
</html>
`;
    };
    const openPrintDocument = (html) => {
        if (typeof window === 'undefined' || typeof document === 'undefined')
            return false;
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
        const frameWindow = iframe.contentWindow;
        const frameDoc = frameWindow?.document;
        if (!frameWindow || !frameDoc) {
            document.body.removeChild(iframe);
            setEntryAlert('No se pudo preparar la impresión. Recarga la página e inténtalo de nuevo.');
            return false;
        }
        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();
        const cleanup = () => {
            setTimeout(() => {
                try {
                    document.body.removeChild(iframe);
                }
                catch {
                    /* ignore cleanup errors */
                }
            }, 100);
        };
        setTimeout(() => {
            try {
                frameWindow.focus();
                frameWindow.print();
            }
            catch {
                /* ignore print errors */
            }
            finally {
                cleanup();
            }
        }, 250);
        return true;
    };
    const handlePrintBoleta = useCallback((entry, period) => {
        const slip = buildPayrollSlip(entry, period);
        const docTitle = `Boleta ${MONTH_NAMES[period.month - 1]} ${period.year}`;
        const html = renderPrintDocument([slip], docTitle);
        openPrintDocument(html);
    }, [buildPayrollSlip]);
    const handlePrintAllBoletas = useCallback(() => {
        if (!periodDetails || !periodDetails.entries.length) {
            setEntryAlert('No hay boletas para imprimir.');
            return;
        }
        const slips = periodDetails.entries.map(entry => buildPayrollSlip(entry, periodDetails));
        const title = `Planillas ${MONTH_NAMES[periodDetails.month - 1]} ${periodDetails.year}`;
        const html = renderPrintDocument(slips, title);
        openPrintDocument(html);
    }, [buildPayrollSlip, periodDetails]);
    const attendanceRange = useMemo(() => parseMonthKey(attendanceMonth), [attendanceMonth]);
    const chosenEntry = useMemo(() => {
        if (!periodDetails || !entryForm.entryId)
            return null;
        return periodDetails.entries.find(e => e.id === Number(entryForm.entryId)) ?? null;
    }, [periodDetails, entryForm.entryId]);
    const chosenEntrySummary = useMemo(() => {
        if (!chosenEntry)
            return null;
        return summarizeEntry(chosenEntry);
    }, [chosenEntry, summarizeEntry]);
    const periodTotals = useMemo(() => {
        if (!periodDetails)
            return null;
        return periodDetails.entries.reduce((acc, entry) => {
            const breakdown = (entry.details?.breakdown ?? {});
            const monthlyBase = breakdown?.monthlyBase ?? entry.baseSalary ?? 0;
            const holidayBonus = Number(breakdown?.holidayBonus ?? entry.holidayBonus ?? 0) || 0;
            const overtimeBonus = Number(breakdown?.overtimeBonus ?? 0) || 0;
            const sundayBonus = Number(breakdown?.weekendSundayBonus ?? 0) || 0;
            const manualBonuses = Number(breakdown?.manualBonuses ?? 0) || 0;
            let extrasAmount = overtimeBonus + sundayBonus;
            let manualAmount = manualBonuses;
            if (extrasAmount <= 0 && manualAmount <= 0) {
                const entryBonuses = Number(entry.bonusesTotal ?? 0) || 0;
                extrasAmount = Math.max(entryBonuses - holidayBonus, 0);
            }
            acc.base += Number(monthlyBase) || 0;
            acc.holidays += holidayBonus;
            acc.extras += extrasAmount;
            acc.bonuses += manualAmount;
            acc.deductions += resolveActualDeductions(entry);
            acc.pensions += Number(entry.pensionAmount ?? 0) || 0;
            acc.advances += resolveManualAdvances(entry);
            acc.net += Number(entry.netPay ?? 0) || 0;
            return acc;
        }, { base: 0, holidays: 0, extras: 0, bonuses: 0, deductions: 0, pensions: 0, advances: 0, net: 0 });
    }, [periodDetails]);
    const periodSummaryStats = useMemo(() => periodTotals
        ? [
            { key: 'base', label: 'Sueldos base', value: periodTotals.base, always: true },
            { key: 'holidays', label: 'Feriados', value: periodTotals.holidays },
            { key: 'extras', label: 'Horas extras', value: periodTotals.extras },
            { key: 'bonuses', label: 'Bonos', value: periodTotals.bonuses },
            { key: 'deductions', label: 'Descuentos', value: periodTotals.deductions },
            { key: 'pensions', label: 'Pensiones', value: periodTotals.pensions },
            { key: 'advances', label: 'Adelantos', value: periodTotals.advances },
            { key: 'net', label: 'Neto acumulado', value: periodTotals.net, always: true },
        ].filter(stat => stat.always || Math.abs(stat.value) > 0.005)
        : [], [periodTotals]);
    const areaReportRows = useMemo(() => {
        if (!periodDetails)
            return [];
        return periodDetails.entries
            .filter(entry => reportAreaFilter === 'ALL' ? true : (entry.employee?.area ?? 'OPERATIVE') === reportAreaFilter)
            .map(entry => {
            const summary = summarizeEntry(entry);
            return summary ? { entry, summary } : null;
        })
            .filter((row) => row !== null);
    }, [periodDetails, reportAreaFilter, summarizeEntry]);
    const areaReportNetTotal = useMemo(() => areaReportRows.reduce((acc, row) => acc + (Number(row.entry.netPay ?? 0) || 0), 0), [areaReportRows]);
    const accountsRows = useMemo(() => {
        if (!periodDetails)
            return [];
        return periodDetails.entries.map(entry => {
            const resolvedEmployee = employeesById.get(entry.employeeId) ?? entry.employee;
            const accountNumber = resolvedEmployee?.accountNumber?.trim() ?? '';
            const cci = resolvedEmployee?.cci?.trim() ?? '';
            const yapePlin = resolvedEmployee?.phone?.trim() ?? '';
            return {
                worker: employeeName(resolvedEmployee),
                bank: BANK_TYPE_LABELS[resolvedEmployee?.bankType ?? 'BCP'],
                account: accountNumber || '—',
                cci: cci || '—',
                yapePlin: yapePlin || '—',
                hasAccount: Boolean(accountNumber) || Boolean(cci) || Boolean(yapePlin),
            };
        });
    }, [employeesById, periodDetails]);
    const accumulationSummary = useMemo(() => {
        if (!accumulationPeriods.length) {
            return {
                ready: true,
                months: [],
                rows: [],
                monthTotals: [],
                monthTotalsPaid: [],
                monthTotalsDeductions: [],
                monthDeductionBreakdown: [],
                totalDeductionBreakdown: createDeductionBreakdown(),
                monthAdvances: [],
                monthHolidays: [],
                monthBonuses: [],
                monthOvertime: [],
                total: 0,
                totalPaid: 0,
                totalDeductions: 0,
                totalAdvances: 0,
                totalHolidays: 0,
                totalBonuses: 0,
                totalOvertime: 0,
                areaExtras: createAreaExtrasMap(),
            };
        }
        const months = accumulationPeriods.map(period => ({
            id: period.id,
            label: `${MONTH_NAMES[period.month - 1]} ${period.year}`,
        }));
        const ready = accumulationPeriods.every(period => Boolean(periodDetailsCache[period.id]));
        if (!ready) {
            return {
                ready: false,
                months,
                rows: [],
                monthTotals: [],
                monthTotalsPaid: [],
                monthTotalsDeductions: [],
                monthDeductionBreakdown: [],
                totalDeductionBreakdown: createDeductionBreakdown(),
                monthAdvances: [],
                monthHolidays: [],
                monthBonuses: [],
                monthOvertime: [],
                total: 0,
                totalPaid: 0,
                totalDeductions: 0,
                totalAdvances: 0,
                totalHolidays: 0,
                totalBonuses: 0,
                totalOvertime: 0,
                areaExtras: createAreaExtrasMap(),
            };
        }
        const areaExtras = createAreaExtrasMap();
        const rowsMap = new Map();
        accumulationPeriods.forEach((period, periodIndex) => {
            const details = periodDetailsCache[period.id];
            if (!details)
                return;
            details.entries.forEach(entry => {
                const employeeRef = employeesById.get(entry.employeeId) ?? entry.employee;
                const area = (employeeRef?.area ?? entry.employee?.area ?? 'OPERATIVE');
                const net = Number(entry.netPay ?? 0) || 0;
                if (!rowsMap.has(entry.employeeId)) {
                    const accountNumber = employeeRef?.accountNumber?.trim() || entry.employee?.accountNumber?.trim() || '';
                    const cci = employeeRef?.cci?.trim() || entry.employee?.cci?.trim() || '';
                    const yapePlin = employeeRef?.phone?.trim() || entry.employee?.phone?.trim() || '';
                    const bankLabel = resolveBankLabel((employeeRef?.bankType ?? entry.employee?.bankType));
                    rowsMap.set(entry.employeeId, {
                        employeeId: entry.employeeId,
                        employee: employeeRef,
                        area,
                        perMonth: Array(accumulationPeriods.length).fill(0),
                        perMonthPaid: Array(accumulationPeriods.length).fill(0),
                        perMonthDeductions: Array(accumulationPeriods.length).fill(0),
                        total: 0,
                        totalPaid: 0,
                        totalDeductions: 0,
                        account: accountNumber || '—',
                        cci: cci || '—',
                        yapePlin: yapePlin || '—',
                        bank: bankLabel,
                    });
                }
                const row = rowsMap.get(entry.employeeId);
                const manualAdvances = resolveManualAdvances(entry);
                const paidAmount = net + manualAdvances;
                const deductionsAmount = resolveActualDeductions(entry);
                row.perMonth[periodIndex] += net;
                row.perMonthPaid[periodIndex] += paidAmount;
                row.perMonthDeductions[periodIndex] += deductionsAmount;
                row.total += net;
                row.totalPaid += paidAmount;
                row.totalDeductions += deductionsAmount;
                if (!row.employee && employeeRef)
                    row.employee = employeeRef;
                row.area = area;
                const accountNumber = employeeRef?.accountNumber?.trim() || entry.employee?.accountNumber?.trim() || '';
                const cci = employeeRef?.cci?.trim() || entry.employee?.cci?.trim() || '';
                const yapePlin = employeeRef?.phone?.trim() || entry.employee?.phone?.trim() || '';
                const bankLabel = resolveBankLabel((employeeRef?.bankType ?? entry.employee?.bankType));
                if ((!row.account || row.account === '—') && accountNumber)
                    row.account = accountNumber;
                if ((!row.cci || row.cci === '—') && cci)
                    row.cci = cci;
                if ((!row.yapePlin || row.yapePlin === '—') && yapePlin)
                    row.yapePlin = yapePlin;
                if ((!row.bank || row.bank === '—') && bankLabel !== '—')
                    row.bank = bankLabel;
            });
        });
        const rows = Array.from(rowsMap.values()).sort((a, b) => employeeName(a.employee).localeCompare(employeeName(b.employee)));
        const monthTotals = Array(accumulationPeriods.length).fill(0);
        const monthTotalsPaid = Array(accumulationPeriods.length).fill(0);
        const monthTotalsDeductions = Array(accumulationPeriods.length).fill(0);
        const monthDeductionBreakdown = Array.from({ length: accumulationPeriods.length }, () => createDeductionBreakdown());
        const monthAdvances = Array(accumulationPeriods.length).fill(0);
        const monthHolidays = Array(accumulationPeriods.length).fill(0);
        const monthBonuses = Array(accumulationPeriods.length).fill(0);
        const monthOvertime = Array(accumulationPeriods.length).fill(0);
        rows.forEach(row => {
            row.perMonth.forEach((value, index) => {
                monthTotals[index] += value;
            });
            row.perMonthPaid.forEach((value, index) => {
                monthTotalsPaid[index] += value;
            });
            row.perMonthDeductions.forEach((value, index) => {
                monthTotalsDeductions[index] += value;
            });
        });
        accumulationPeriods.forEach((period, index) => {
            const details = periodDetailsCache[period.id];
            if (!details)
                return;
            const bucket = monthDeductionBreakdown[index];
            details.entries.forEach(entry => {
                const breakdown = (entry.details?.breakdown ?? {});
                const holidayBonus = Number(entry.holidayBonus ?? 0) || 0;
                const weekendSundayBonus = Number(breakdown?.weekendSundayBonus ?? 0) || 0;
                const manualBonuses = Number(breakdown?.manualBonuses ?? 0) || 0;
                const overtimeBonus = Number(breakdown?.overtimeBonus ?? 0) || 0;
                const components = resolveDeductionComponents(entry);
                bucket.absence += components.absence;
                bucket.permission += components.permission;
                bucket.tardiness += components.tardiness;
                bucket.manual += components.manual;
                const advancesValue = resolveManualAdvances(entry);
                monthAdvances[index] += advancesValue;
                monthHolidays[index] += holidayBonus + weekendSundayBonus;
                monthBonuses[index] += manualBonuses;
                monthOvertime[index] += overtimeBonus;
                const entryEmployee = employeesById.get(entry.employeeId) ?? entry.employee;
                const entryArea = (entryEmployee?.area ?? entry.employee?.area ?? 'OPERATIVE');
                const targets = [areaExtras.ALL, areaExtras[entryArea]];
                targets.forEach(target => {
                    target.advances += advancesValue;
                    target.holidays += holidayBonus + weekendSundayBonus;
                    target.overtime += overtimeBonus;
                    target.bonuses += manualBonuses;
                });
            });
        });
        const total = rows.reduce((acc, row) => acc + row.total, 0);
        const totalPaid = rows.reduce((acc, row) => acc + row.totalPaid, 0);
        const totalDeductions = rows.reduce((acc, row) => acc + row.totalDeductions, 0);
        const totalDeductionBreakdown = monthDeductionBreakdown.reduce((acc, breakdown) => {
            acc.absence += breakdown.absence;
            acc.permission += breakdown.permission;
            acc.tardiness += breakdown.tardiness;
            acc.manual += breakdown.manual;
            return acc;
        }, createDeductionBreakdown());
        return {
            ready: true,
            months,
            rows,
            monthTotals,
            monthTotalsPaid,
            monthTotalsDeductions,
            monthDeductionBreakdown,
            totalDeductionBreakdown,
            monthAdvances,
            monthHolidays,
            monthBonuses,
            monthOvertime,
            total,
            totalPaid,
            totalDeductions,
            totalAdvances: monthAdvances.reduce((acc, value) => acc + value, 0),
            totalHolidays: monthHolidays.reduce((acc, value) => acc + value, 0),
            totalBonuses: monthBonuses.reduce((acc, value) => acc + value, 0),
            totalOvertime: monthOvertime.reduce((acc, value) => acc + value, 0),
            areaExtras,
        };
    }, [accumulationPeriods, periodDetailsCache, employeesById]);
    const accumulationRowsForArea = useMemo(() => reportAreaFilter === 'ALL'
        ? accumulationSummary.rows
        : accumulationSummary.rows.filter(row => row.area === reportAreaFilter), [accumulationSummary.rows, reportAreaFilter]);
    const accumulationDisplay = useMemo(() => {
        const rows = accumulationRowsForArea;
        const months = accumulationSummary.months;
        const paymentFilter = accumulationPaymentFilter;
        const accountFilter = accumulationAccountFilter;
        const filteredRows = rows.filter(row => {
            const paid = accumulationPayments[row.employeeId] ?? false;
            if (paymentFilter === 'PAID' && !paid)
                return false;
            if (paymentFilter === 'UNPAID' && paid)
                return false;
            const hasAccount = Boolean((row.account && row.account !== '—') ||
                (row.cci && row.cci !== '—') ||
                (row.yapePlin && row.yapePlin !== '—'));
            if (accountFilter === 'WITH' && !hasAccount)
                return false;
            if (accountFilter === 'WITHOUT' && hasAccount)
                return false;
            return true;
        });
        const monthTotals = Array(months.length).fill(0);
        const monthTotalsPaid = Array(months.length).fill(0);
        const monthTotalsDeductions = Array(months.length).fill(0);
        filteredRows.forEach(row => {
            row.perMonth.forEach((value, index) => {
                monthTotals[index] += value;
            });
            row.perMonthPaid.forEach((value, index) => {
                monthTotalsPaid[index] += value;
            });
            row.perMonthDeductions.forEach((value, index) => {
                monthTotalsDeductions[index] += value;
            });
        });
        const total = filteredRows.reduce((acc, row) => acc + row.total, 0);
        const totalPaid = filteredRows.reduce((acc, row) => acc + row.totalPaid, 0);
        const totalDeductions = filteredRows.reduce((acc, row) => acc + row.totalDeductions, 0);
        return {
            rows: filteredRows,
            months,
            monthTotals,
            monthTotalsPaid,
            monthTotalsDeductions,
            total,
            totalPaid,
            totalDeductions,
        };
    }, [
        accumulationRowsForArea,
        accumulationSummary,
        accumulationAccountFilter,
        accumulationPaymentFilter,
        accumulationPayments,
    ]);
    const filteredAccountsRows = useMemo(() => {
        if (bankFilter === 'ALL')
            return accountsRows;
        const predicate = (row) => bankFilter === 'WITH' ? row.hasAccount : !row.hasAccount;
        return accountsRows.filter(predicate);
    }, [accountsRows, bankFilter]);
    const accumulationAreaBreakdown = useMemo(() => {
        const template = () => ({
            monthNet: Array(accumulationSummary.months.length).fill(0),
            monthPaid: Array(accumulationSummary.months.length).fill(0),
            monthDeductions: Array(accumulationSummary.months.length).fill(0),
            totalNet: 0,
            totalPaid: 0,
            totalDeductions: 0,
            netPaid: 0,
            netPending: 0,
        });
        const map = {
            ALL: template(),
            OPERATIVE: template(),
            ADMINISTRATIVE: template(),
        };
        accumulationSummary.rows.forEach(row => {
            const targets = [map.ALL, map[row.area]];
            const isPaid = accumulationPayments[row.employeeId] ?? false;
            targets.forEach(bucket => {
                row.perMonth.forEach((value, index) => {
                    bucket.monthNet[index] += value;
                });
                row.perMonthPaid.forEach((value, index) => {
                    bucket.monthPaid[index] += value;
                });
                row.perMonthDeductions.forEach((value, index) => {
                    bucket.monthDeductions[index] += value;
                });
                bucket.totalNet += row.total;
                bucket.totalPaid += row.totalPaid;
                bucket.totalDeductions += row.totalDeductions;
                if (isPaid)
                    bucket.netPaid += row.total;
                else
                    bucket.netPending += row.total;
            });
        });
        map.ALL.monthNet = accumulationSummary.monthTotals.slice();
        map.ALL.monthPaid = accumulationSummary.monthTotalsPaid.slice();
        map.ALL.monthDeductions = accumulationSummary.monthTotalsDeductions.slice();
        map.ALL.totalNet = accumulationSummary.total;
        map.ALL.totalPaid = accumulationSummary.totalPaid;
        map.ALL.totalDeductions = accumulationSummary.totalDeductions;
        return map;
    }, [accumulationPayments, accumulationSummary]);
    const summaryCardMonths = useMemo(() => {
        const rows = accumulationSummary.rows;
        const start = Math.max(accumulationSummary.months.length - DEFAULT_ACCUMULATION_MONTHS, 0);
        return accumulationSummary.months.slice(start).map((month, displayIndex) => {
            const summaryIndex = start + displayIndex;
            const breakdown = accumulationSummary.monthDeductionBreakdown[summaryIndex] ?? createDeductionBreakdown();
            let paidMarked = 0;
            rows.forEach(row => {
                const value = row.perMonth[summaryIndex] ?? 0;
                if (!value)
                    return;
                const isPaid = accumulationPayments[row.employeeId] ?? false;
                if (isPaid)
                    paidMarked += value;
            });
            const net = accumulationSummary.monthTotals[summaryIndex] ?? 0;
            const advances = accumulationSummary.monthAdvances[summaryIndex] ?? 0;
            const holidays = accumulationSummary.monthHolidays[summaryIndex] ?? 0;
            const overtime = accumulationSummary.monthOvertime[summaryIndex] ?? 0;
            const bonuses = accumulationSummary.monthBonuses[summaryIndex] ?? 0;
            const extrasTotal = advances + holidays + overtime + bonuses;
            const disbursed = paidMarked + extrasTotal;
            const pendingNet = Math.max(net - paidMarked, 0);
            const totalToPay = disbursed + pendingNet;
            return {
                id: month.id,
                label: month.label,
                net,
                disbursed,
                pending: pendingNet,
                totalToPay,
                extrasTotal,
                deductions: accumulationSummary.monthTotalsDeductions[summaryIndex] ?? 0,
                breakdown,
                breakdownLabel: formatDeductionBreakdown(breakdown),
                paidMarked,
                advances,
                holidays,
                overtime,
                bonuses,
            };
        });
    }, [accumulationPayments, accumulationSummary]);
    const summaryCardAreas = useMemo(() => ['ALL', ...EMPLOYEE_AREA_VALUES].map(bucket => ({
        key: bucket,
        label: bucket === 'ALL' ? 'Resumen general' : EMPLOYEE_AREA_LABELS[bucket],
        data: accumulationAreaBreakdown[bucket],
        extras: accumulationSummary.areaExtras[bucket],
    })), [accumulationAreaBreakdown, accumulationSummary.areaExtras]);
    const accumulationPaymentStats = useMemo(() => {
        return accumulationSummary.rows.reduce((acc, row) => {
            const isPaid = accumulationPayments[row.employeeId] ?? false;
            const totalPaid = row.totalPaid;
            if (isPaid) {
                acc.paid += totalPaid;
                acc.paidCount += 1;
            }
            else {
                acc.pending += totalPaid;
                acc.pendingCount += 1;
            }
            return acc;
        }, { paid: 0, pending: 0, paidCount: 0, pendingCount: 0 });
    }, [accumulationPayments, accumulationSummary.rows]);
    const accumulationDisbursement = useMemo(() => {
        const extras = {
            advances: accumulationSummary.totalAdvances,
            holidays: accumulationSummary.totalHolidays,
            overtime: accumulationSummary.totalOvertime,
            bonuses: accumulationSummary.totalBonuses,
        };
        const extrasTotal = extras.advances + extras.holidays + extras.overtime + extras.bonuses;
        const totalDisbursed = Math.max(accumulationPaymentStats.paid, 0);
        const pending = Math.max(accumulationPaymentStats.pending, 0);
        return {
            extras,
            extrasTotal,
            totalDisbursed,
            pending,
            totalToPay: totalDisbursed + pending,
        };
    }, [
        accumulationPaymentStats,
        accumulationSummary.totalAdvances,
        accumulationSummary.totalHolidays,
        accumulationSummary.totalOvertime,
        accumulationSummary.totalBonuses,
    ]);
    const handlePrintAreaReport = useCallback(() => {
        if (!periodDetails) {
            setEntryAlert('Selecciona un periodo para imprimir.');
            return;
        }
        if (!areaReportRows.length) {
            setEntryAlert('No hay colaboradores en esta área para este periodo.');
            return;
        }
        const areaLabel = reportAreaFilter === 'ALL'
            ? 'Todas las áreas'
            : EMPLOYEE_AREA_LABELS[reportAreaFilter];
        const monthLabel = `${MONTH_NAMES[periodDetails.month - 1]} ${periodDetails.year}`;
        const rowsHtml = areaReportRows
            .map(({ entry, summary }) => {
            const worker = escapeHtml(employeeName(entry.employee));
            const daysLine = escapeHtml(summary.daysDisplay);
            const ingreso = summary.startDate ? `<div class="muted">Ingreso: ${escapeHtml(formatIsoDate(summary.startDate))}</div>` : '';
            const workCell = `${summary.workedDays} / ${summary.absenceDays}`;
            const tardyCell = `${summary.tardinessMinutes} min · Permisos: ${summary.permissionDaysRecorded}d (${escapeHtml(fixed2(summary.permissionHours))} h)`;
            const feriadosCell = `${summary.holidayDays} días · ${currency(summary.holidayBonus)}`;
            const deductions = currency(summary.actualDeductions);
            const bonuses = currency(entry.bonusesTotal ?? 0);
            const neto = currency(entry.netPay ?? 0);
            return `
  <tr>
    <td>${worker}</td>
    <td>${currency(summary.monthlyBase)}</td>
    <td>${currency(summary.proratedBase)}</td>
    <td>${daysLine}${ingreso}</td>
    <td>${workCell}</td>
    <td>${tardyCell}</td>
    <td>${feriadosCell}</td>
    <td>${deductions}</td>
    <td>${bonuses}</td>
    <td>${neto}</td>
  </tr>`;
        })
            .join('');
        const totalsRow = `
  <tr class="totals-row">
    <td colspan="9">Total neto del área</td>
    <td>${currency(areaReportNetTotal)}</td>
  </tr>`;
        const reportSection = `
<section class="area-report">
  <h2>Reporte ${escapeHtml(areaLabel)} · ${escapeHtml(monthLabel)}</h2>
  <table>
    <thead>
      <tr>
        <th>Trabajador</th>
        <th>Sueldo mensual</th>
        <th>Prorrateado</th>
        <th>Días remunerados</th>
        <th>Asistencias / Faltas</th>
        <th>Tardanzas / Permisos</th>
        <th>Feriados</th>
        <th>Descuentos</th>
        <th>Ajustes</th>
        <th>Sueldo neto</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      ${totalsRow}
    </tfoot>
  </table>
</section>`;
        const title = `Planillas${MONTH_NAMES[periodDetails.month - 1]}${areaLabel.replace(/\\s+/g, '')}${periodDetails.year}`;
        const html = renderPrintDocument([reportSection], title);
        openPrintDocument(html);
    }, [areaReportNetTotal, areaReportRows, periodDetails, reportAreaFilter, renderPrintDocument]);
    const handlePrintBankReport = useCallback(() => {
        if (!periodDetails) {
            setEntryAlert('Selecciona un periodo para imprimir las cuentas.');
            return;
        }
        if (!filteredAccountsRows.length) {
            setEntryAlert('No hay registros que coincidan con el filtro seleccionado.');
            return;
        }
        const monthLabel = `${MONTH_NAMES[periodDetails.month - 1]} ${periodDetails.year}`;
        const rowsHtml = filteredAccountsRows
            .map(row => {
            const worker = escapeHtml(row.worker);
            const bank = escapeHtml(row.bank);
            const account = escapeHtml(row.account);
            const cci = escapeHtml(row.cci);
            const yapePlin = escapeHtml(row.yapePlin);
            return `
  <tr>
    <td>${worker}</td>
    <td>${bank}</td>
    <td>${account}</td>
    <td>${cci}</td>
    <td>${yapePlin}</td>
  </tr>`;
        })
            .join('');
        const reportSection = `
<section class="area-report">
  <h2>Relación de cuentas · ${escapeHtml(monthLabel)}</h2>
  <table>
    <thead>
      <tr>
        <th>Trabajador</th>
        <th>Banco</th>
        <th>Número de cuenta</th>
        <th>CCI</th>
        <th>Yape/Plin</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</section>`;
        const titleSuffix = bankFilter === 'WITH' ? 'ConCuenta' : bankFilter === 'WITHOUT' ? 'SinCuenta' : 'Todas';
        const html = renderPrintDocument([reportSection], `Cuentas${titleSuffix}${monthLabel.replace(/\\s+/g, '')}`);
        openPrintDocument(html);
    }, [bankFilter, filteredAccountsRows, openPrintDocument, periodDetails, renderPrintDocument]);
    const handlePrintAccumulationReport = useCallback(() => {
        if (!accumulationSummary.months.length) {
            setEntryAlert('Selecciona al menos un periodo para imprimir el acumulado.');
            return;
        }
        if (!accumulationSummary.ready) {
            setEntryAlert('Espera a que termine el cálculo del acumulado.');
            return;
        }
        if (!accumulationDisplay.rows.length) {
            setEntryAlert('No hay información acumulada para los filtros seleccionados.');
            return;
        }
        const areaLabel = reportAreaFilter === 'ALL'
            ? 'Todas las áreas'
            : EMPLOYEE_AREA_LABELS[reportAreaFilter];
        const monthHeaders = accumulationSummary.months
            .map(month => `<th>${escapeHtml(month.label)}</th>`)
            .join('');
        const rowsHtml = accumulationDisplay.rows
            .map(row => {
            const worker = escapeHtml(employeeName(row.employee));
            const account = escapeHtml(row.account || '—');
            const cci = escapeHtml(row.cci || '—');
            const yapePlin = escapeHtml(row.yapePlin || '—');
            const bank = escapeHtml(row.bank || '—');
            const monthCells = accumulationSummary.months
                .map((_month, index) => {
                const netValue = row.perMonth[index] ?? 0;
                const paidValue = row.perMonthPaid[index] ?? netValue;
                return `<td><div>${currency(netValue)}</div><div class="muted">Pagado: ${currency(paidValue)}</div></td>`;
            })
                .join('');
            return `
  <tr>
    <td>${worker}</td>
    ${monthCells}
    <td>${currency(row.total)}</td>
    <td>${currency(row.totalPaid)}</td>
    <td>${currency(row.totalDeductions)}</td>
    <td>${bank}</td>
    <td>${account}</td>
    <td>${cci}</td>
    <td>${yapePlin}</td>
    <td>${accumulationPayments[row.employeeId] ? 'Pagado' : 'Pendiente'}</td>
  </tr>`;
        })
            .join('');
        const totalsCells = accumulationDisplay.monthTotals
            .map((total, index) => {
            const paidValue = accumulationDisplay.monthTotalsPaid[index] ?? total;
            const deductionValue = accumulationDisplay.monthTotalsDeductions[index] ?? 0;
            return `<td><div>${currency(total)}</div><div class="muted">Pagado: ${currency(paidValue)}</div><div class="muted">Desc.: ${currency(deductionValue)}</div></td>`;
        })
            .join('');
        const reportSection = `
<section class="area-report">
  <h2>Acumulado histórico · ${escapeHtml(areaLabel)}</h2>
  <p>Periodos: ${escapeHtml(accumulationSummary.months.map(month => month.label).join(', '))}</p>
  <p class="muted">Cada celda muestra el neto del mes y debajo el total pagado (neto + adelantos).</p>
  <table>
    <thead>
      <tr>
        <th>Trabajador</th>
        ${monthHeaders}
        <th>Acumulado</th>
        <th>Pagado total</th>
        <th>Descuentos</th>
        <th>Banco</th>
        <th>Cuenta bancaria</th>
        <th>CCI</th>
        <th>Yape/Plin</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td>Subtotal ${escapeHtml(areaLabel)}</td>
        ${totalsCells}
        <td>${currency(accumulationDisplay.total)}</td>
        <td>${currency(accumulationDisplay.totalPaid)}</td>
        <td>${currency(accumulationDisplay.totalDeductions)}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>
    </tfoot>
  </table>
</section>`;
        const title = `Acumulado${areaLabel.replace(/\s+/g, '')}${accumulationSummary.months
            .map(month => month.label.replace(/\s+/g, ''))
            .join('')}`;
        const html = renderPrintDocument([reportSection], title || 'Acumulado', { orientation: 'landscape' });
        openPrintDocument(html);
    }, [accumulationDisplay, accumulationSummary, accumulationPayments, openPrintDocument, reportAreaFilter, renderPrintDocument]);
    const chosenEntryAttendance = chosenEntrySummary?.attendance;
    const attendancePenaltyDays = chosenEntryAttendance?.absencePenaltyDays && chosenEntryAttendance.absencePenaltyDays > 0
        ? chosenEntryAttendance.absencePenaltyDays
        : 0;
    const recordedAbsenceDays = chosenEntryAttendance?.recordedAbsenceDays ??
        chosenEntryAttendance?.absenceDays ??
        chosenEntry?.absenceDays ??
        0;
    const attendanceFilterEmployee = useMemo(() => typeof attendanceEmployeeFilter === 'number'
        ? employees.find(employee => employee.id === attendanceEmployeeFilter) ?? null
        : null, [attendanceEmployeeFilter, employees]);
    return (_jsxs("div", { className: "mx-auto flex max-w-6xl flex-col gap-6 p-4", children: [_jsxs("header", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-slate-800", children: "Administraci\u00F3n de Personal" }), _jsx("p", { className: "text-sm text-slate-500", children: "Control de asistencia, planillas y boletas para Consorcio Pac\u00EDfico." })] }), _jsx("div", { className: "flex gap-2", children: ['employees', 'attendance', 'payroll'].map(key => (_jsxs("button", { type: "button", onClick: () => setTab(key), className: `rounded-md border px-3 py-1 text-sm font-medium ${tab === key ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-slate-300 text-slate-600'}`, children: [key === 'employees' && 'Personal', key === 'attendance' && 'Asistencia', key === 'payroll' && 'Planillas'] }, key))) })] }), _jsx("section", { className: "flex flex-wrap items-center gap-3", children: _jsxs("label", { className: "text-sm font-semibold text-slate-600", children: ["Obra", _jsx("div", { className: "mt-1", children: _jsx(SearchableSelect, { value: typeof obraId === 'number' ? obraId : '', options: obras.map((obra) => ({ value: obra.id, label: obra.name })), onChange: (selected, input) => {
                                    if (selected !== null) {
                                        setObraId(selected);
                                    }
                                    else if (!input.trim()) {
                                        setObraId('');
                                    }
                                }, placeholder: "Todas las obras" }) })] }) }), tab === 'employees' && (_jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold text-slate-700", children: "Registrar trabajador" }), employeeAlert && (_jsx("p", { className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700", children: employeeAlert })), _jsxs("form", { className: "flex flex-col gap-3", onSubmit: handleCreateEmployee, children: [_jsxs("div", { className: "flex gap-3", children: [_jsx("input", { className: "flex-1 rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Nombres", value: employeeForm.firstName, onChange: event => handleEmployeeFormChange('firstName', event.target.value), required: true }), _jsx("input", { className: "flex-1 rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Apellidos", value: employeeForm.lastName, onChange: event => handleEmployeeFormChange('lastName', event.target.value), required: true })] }), _jsx("input", { className: "rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Documento (DNI)", value: employeeForm.documentNumber, onChange: event => handleEmployeeFormChange('documentNumber', event.target.value) }), _jsx("input", { className: "rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Cargo", value: employeeForm.position, onChange: event => handleEmployeeFormChange('position', event.target.value) }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Sueldo base (PEN)", _jsx("input", { type: "number", step: "0.01", min: "0", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.baseSalary, onChange: event => handleEmployeeFormChange('baseSalary', event.target.value), required: true })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Sistema pensionario", _jsx(SearchableSelect, { value: employeeForm.pensionSystem, options: PENSION_SYSTEM_OPTIONS, onChange: (selected, input) => {
                                                            if (selected)
                                                                handleEmployeeFormChange('pensionSystem', selected);
                                                            else if (!input.trim())
                                                                handleEmployeeFormChange('pensionSystem', '');
                                                        }, placeholder: "Selecciona o escribe el sistema" })] })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["\u00C1rea del trabajador", _jsx("select", { className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.area, onChange: event => handleEmployeeFormChange('area', event.target.value), children: EMPLOYEE_AREA_OPTIONS.map(option => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Banco", _jsx("select", { className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.bankType, onChange: event => handleEmployeeFormChange('bankType', event.target.value), children: BANK_TYPE_OPTIONS.map(option => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["N\u00FAmero de cuenta", _jsx("input", { className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Cuenta bancaria", value: employeeForm.accountNumber, onChange: event => handleEmployeeFormChange('accountNumber', event.target.value) })] })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["CCI", _jsx("input", { className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "C\u00F3digo CCI", value: employeeForm.cci, onChange: event => handleEmployeeFormChange('cci', event.target.value) })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Celular", _jsx("input", { className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "N\u00FAmero de celular", value: employeeForm.phone, onChange: event => handleEmployeeFormChange('phone', event.target.value) })] })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Fecha de ingreso", _jsx("input", { type: "date", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.startDate, onChange: event => handleEmployeeFormChange('startDate', event.target.value) })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["% Pensi\u00F3n", _jsx("input", { type: "number", step: "0.01", min: "0", max: "1", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.pensionRate, onChange: event => handleEmployeeFormChange('pensionRate', event.target.value) })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["% Essalud", _jsx("input", { type: "number", step: "0.01", min: "0", max: "1", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: employeeForm.healthRate, onChange: event => handleEmployeeFormChange('healthRate', event.target.value) })] })] }), _jsxs("label", { className: "flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600", children: [_jsx("input", { type: "checkbox", className: "mt-1 h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500", checked: employeeForm.absenceSundayPenalty, onChange: event => handleEmployeeFormChange('absenceSundayPenalty', event.target.checked) }), _jsxs("span", { children: ["Descontar domingos cuando exista falta", _jsx("span", { className: "mt-1 block text-xs text-slate-500", children: "Si falta uno o m\u00E1s d\u00EDas en la semana se descuenta tambi\u00E9n el domingo de esa semana." })] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("button", { type: "submit", className: "rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700", children: typeof selectedEmployeeId === 'number' ? 'Actualizar trabajador' : 'Guardar trabajador' }), _jsx("div", { className: "min-w-[220px]", children: _jsx(SearchableSelect, { value: selectedEmployeeId === '' ? '' : String(selectedEmployeeId), options: employees.map((emp) => ({
                                                        value: String(emp.id),
                                                        label: employeeName(emp),
                                                    })), onChange: (selected, input) => {
                                                        if (selected !== null) {
                                                            const id = Number(selected);
                                                            setSelectedEmployeeId(id);
                                                            handleEditEmployee(id);
                                                        }
                                                        else if (!input.trim()) {
                                                            setSelectedEmployeeId('');
                                                            setEmployeeForm(defaultEmployeeForm());
                                                        }
                                                    }, placeholder: "Selecciona trabajador" }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300", onClick: () => {
                                                            setEmployeeForm(defaultEmployeeForm());
                                                            setSelectedEmployeeId('');
                                                            setEmployeeAlert(null);
                                                        }, children: "Nuevo" }), _jsx("button", { type: "button", className: `rounded px-3 py-2 text-sm font-semibold text-white ${deleteUnlocked ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-300 cursor-not-allowed'}`, onClick: () => handleDeleteEmployee(), disabled: typeof selectedEmployeeId !== 'number' || !deleteUnlocked, title: deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar', children: "Eliminar" })] })] })] })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-slate-700", children: "Equipo en obra" }), employeesLoading && _jsx("span", { className: "text-xs text-slate-400", children: "Cargando\u2026" })] }), _jsxs("div", { className: "mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600", children: [_jsx("span", { children: "Filtrar por \u00E1rea:" }), AREA_FILTER_BUTTONS.map(option => (_jsx("button", { type: "button", onClick: () => handleEmployeeAreaFilterChange(option.value), className: `rounded-full border px-3 py-1 font-semibold ${employeeAreaFilter === option.value
                                            ? 'border-blue-500 bg-blue-100 text-blue-700'
                                            : 'border-slate-300 text-slate-600'}`, children: option.label }, option.value)))] }), _jsx("div", { className: "max-h-[420px] overflow-y-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Trabajador" }), _jsx("th", { className: "px-3 py-2", children: "Documento" }), _jsx("th", { className: "px-3 py-2", children: "Cargo" }), _jsx("th", { className: "px-3 py-2", children: "\u00C1rea" }), _jsx("th", { className: "px-3 py-2", children: "Ingreso" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Sueldo" }), _jsx("th", { className: "px-3 py-2 text-center", children: "Estado" })] }) }), _jsxs("tbody", { children: [filteredEmployees.map(employee => (_jsxs("tr", { className: "border-b border-slate-100", onClick: () => handleEditEmployee(employee.id), style: {
                                                        backgroundColor: selectedEmployeeId === employee.id
                                                            ? 'rgba(191, 219, 254, 0.4)'
                                                            : undefined,
                                                        cursor: 'pointer',
                                                    }, children: [_jsx("td", { className: "px-3 py-2 font-medium text-slate-700", children: employeeName(employee) }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: employee.documentNumber ?? '—' }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: employee.position ?? '—' }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: employee.area ? EMPLOYEE_AREA_LABELS[employee.area] : EMPLOYEE_AREA_LABELS.OPERATIVE }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: formatIsoDate(employee.startDate ?? null) }), _jsx("td", { className: "px-3 py-2 text-right text-slate-700", children: currency(employee.baseSalary) }), _jsx("td", { className: "px-3 py-2 text-center", children: _jsx("button", { type: "button", onClick: () => toggleEmployeeActive(employee), className: `rounded-full px-2 py-1 text-xs font-semibold ${employee.isActive
                                                                    ? 'bg-green-100 text-green-700'
                                                                    : 'bg-slate-200 text-slate-500'}`, children: employee.isActive ? 'Activo' : 'Baja' }) })] }, employee.id))), !filteredEmployees.length && (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-3 py-6 text-center text-sm text-slate-500", children: "No hay trabajadores registrados para esta obra." }) }))] })] }) })] })] })), tab === 'attendance' && (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[1fr_1.5fr]", children: [_jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold text-slate-700", children: "Registrar asistencia" }), attendanceAlert && (_jsx("p", { className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700", children: attendanceAlert })), _jsxs("form", { className: "flex flex-col gap-3", onSubmit: handleSaveAttendance, children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Trabajador", _jsx(SearchableSelect, { value: attendanceForm.employeeId, options: employees.map(emp => ({ value: String(emp.id), label: employeeName(emp) })), onChange: (selected, input) => {
                                                    if (selected)
                                                        handleAttendanceFormChange('employeeId', selected);
                                                    else if (!input.trim())
                                                        handleAttendanceFormChange('employeeId', '');
                                                }, placeholder: "Selecciona o escribe el trabajador" })] }), _jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Fecha", _jsx("input", { type: "date", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceForm.date, onChange: event => handleAttendanceFormChange('date', event.target.value) })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Estado", _jsx(SearchableSelect, { value: attendanceForm.status, options: ATTENDANCE_STATUS_OPTIONS, onChange: (selected, input) => {
                                                            if (selected)
                                                                handleAttendanceFormChange('status', selected);
                                                            else if (!input.trim())
                                                                handleAttendanceFormChange('status', 'PRESENT');
                                                        }, placeholder: "Selecciona el estado" })] })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Feriados trabajados en el mes", _jsx("input", { type: "number", min: "0", max: "10", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceForm.holidayCount, onChange: (event) => handleAttendanceFormChange('holidayCount', event.target.value) }), _jsx("span", { className: "mt-1 block text-xs text-slate-400", children: "Ingresa cu\u00E1ntos feriados trabaj\u00F3 la persona en el mes para calcular el bono." })] }), attendanceForm.status === 'TARDY' && (_jsxs("label", { className: "text-sm text-slate-600", children: ["Minutos de tardanza", _jsx("input", { type: "number", min: "0", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceForm.minutesLate, onChange: event => handleAttendanceFormChange('minutesLate', event.target.value) })] })), attendanceForm.status === 'PERMISSION' && (_jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Horas sin goce", _jsx("input", { type: "number", min: "0", step: "0.25", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceForm.permissionHours, onChange: event => handleAttendanceFormChange('permissionHours', event.target.value) })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["Condici\u00F3n", _jsx(SearchableSelect, { value: attendanceForm.permissionPaid, options: YES_NO_OPTIONS, onChange: (selected, input) => {
                                                            if (selected)
                                                                handleAttendanceFormChange('permissionPaid', selected);
                                                            else if (!input.trim())
                                                                handleAttendanceFormChange('permissionPaid', 'unpaid');
                                                        }, placeholder: "Con o sin goce" })] })] })), _jsxs("label", { className: "text-sm text-slate-600", children: ["Horas extras", _jsx("input", { type: "number", min: "0", step: "0.25", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceForm.extraHours, onChange: event => handleAttendanceFormChange('extraHours', event.target.value) })] }), _jsx("textarea", { className: "min-h-[80px] rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Observaciones", value: attendanceForm.notes, onChange: event => handleAttendanceFormChange('notes', event.target.value) }), _jsx("button", { type: "submit", className: "rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700", children: "Guardar asistencia" })] })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold text-slate-700", children: "Historial de asistencia" }), _jsxs("p", { className: "text-xs text-slate-500", children: ["Rango: ", attendanceRange.label, attendanceFilterEmployee && ` · Trabajador: ${employeeName(attendanceFilterEmployee)}`] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("input", { type: "month", className: "rounded border border-slate-300 px-3 py-2 text-sm", value: attendanceMonth, onChange: event => setAttendanceMonth(event.target.value) }), _jsx(SearchableSelect, { value: attendanceEmployeeFilter, options: employees.map(employee => ({
                                                    value: employee.id,
                                                    label: employeeName(employee),
                                                })), onChange: (selected, input) => {
                                                    if (selected !== null) {
                                                        setAttendanceEmployeeFilter(selected);
                                                        refreshAttendance(obraId, selected);
                                                    }
                                                    else if (!input.trim()) {
                                                        setAttendanceEmployeeFilter('');
                                                        refreshAttendance(obraId, null);
                                                    }
                                                }, placeholder: "Todos los trabajadores" }), _jsx("button", { type: "button", className: "rounded border border-slate-300 px-3 py-2 text-sm", onClick: () => refreshAttendance(obraId), children: "Actualizar" })] })] }), attendanceLoading && _jsx("p", { className: "text-xs text-slate-400", children: "Cargando asistencias\u2026" }), _jsx("div", { className: "max-h-[420px] overflow-y-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Fecha" }), _jsx("th", { className: "px-3 py-2", children: "Trabajador" }), _jsx("th", { className: "px-3 py-2", children: "Estado" }), _jsx("th", { className: "px-3 py-2", children: "Detalle" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Acciones" })] }) }), _jsxs("tbody", { children: [attendance.map(record => (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2 text-slate-600", children: record.date.slice(0, 10).split('-').reverse().join('/') }), _jsx("td", { className: "px-3 py-2 text-slate-700", children: employeeName(record.employee) }), _jsx("td", { className: "px-3 py-2", children: _jsx("span", { className: "rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600", children: prettyStatus(record.status) }) }), _jsxs("td", { className: "px-3 py-2 text-xs text-slate-500", children: [record.status === 'TARDY' && (_jsxs("div", { children: ["Tardanza ", record.minutesLate ?? 0, " min"] })), record.status === 'PERMISSION' && (_jsx("div", { children: record.permissionPaid === false
                                                                        ? `Permiso sin goce ${record.permissionHours ?? 0} h`
                                                                        : 'Permiso con goce' })), record.status === 'PRESENT' && (_jsx("div", { children: record.extraHours ? `Extras ${record.extraHours} h` : '—' })), record.status === 'ABSENT' && (_jsx("div", { children: record.notes ?? 'Falta' })), (() => {
                                                                    const holidayCount = record.holidayCount ??
                                                                        (record.holidayWorked ? 1 : 0);
                                                                    if (holidayCount > 0) {
                                                                        return (_jsxs("div", { className: "text-blue-600", children: ["Feriados trabajados: ", holidayCount] }));
                                                                    }
                                                                    return null;
                                                                })()] }), _jsx("td", { className: "px-3 py-2 text-right", children: _jsx("button", { type: "button", className: `text-xs font-semibold ${deleteUnlocked ? 'text-rose-600 hover:underline' : 'text-slate-400 cursor-not-allowed opacity-60'}`, onClick: () => handleDeleteAttendance(record), disabled: !deleteUnlocked, title: deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar', children: "Eliminar" }) })] }, record.id))), !attendance.length && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-3 py-6 text-center text-sm text-slate-500", children: "No hay registros de asistencia en el rango seleccionado." }) }))] })] }) })] })] })), tab === 'payroll' && (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]", children: [_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "rounded-3xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("p", { className: "text-xs uppercase tracking-wide text-slate-400", children: "Resumen r\u00E1pido" }), _jsx("h2", { className: "text-2xl font-semibold text-slate-900", children: "Pagos acumulados" }), _jsx("p", { className: "text-sm text-slate-500", children: accumulationSummary.months.length
                                                    ? accumulationSummary.months.map(month => month.label).join(', ')
                                                    : 'Selecciona periodos para ver los totales.' })] }), accumulationSummary.ready && summaryCardMonths.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-6 overflow-x-auto", children: _jsxs("div", { className: "flex min-w-max gap-4", children: [summaryCardMonths.map(month => {
                                                            const detailItems = [
                                                                month.advances > 0
                                                                    ? { key: 'advances', label: 'Adelantos', value: month.advances }
                                                                    : null,
                                                                month.holidays > 0
                                                                    ? { key: 'holidays', label: 'Feriados', value: month.holidays }
                                                                    : null,
                                                                month.overtime > 0
                                                                    ? { key: 'overtime', label: 'Horas extra', value: month.overtime }
                                                                    : null,
                                                                month.bonuses > 0
                                                                    ? { key: 'bonuses', label: 'Bonificaciones', value: month.bonuses }
                                                                    : null,
                                                                month.deductions > 0
                                                                    ? {
                                                                        key: 'deductions',
                                                                        label: 'Descuentos',
                                                                        value: month.deductions,
                                                                        parts: buildDeductionBreakdownParts(month.breakdown),
                                                                    }
                                                                    : null,
                                                            ].filter((item) => item !== null);
                                                            const coverage = month.totalToPay > 0 ? Math.min(month.disbursed / month.totalToPay, 1) : 0;
                                                            return (_jsxs("article", { className: "group relative flex min-w-[280px] flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm shadow-sm shadow-slate-100 ring-1 ring-transparent transition duration-200 hover:-translate-y-1 hover:ring-blue-100", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-400", children: month.label }), _jsx("p", { className: "mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: "Total desembolsado" }), _jsx("p", { className: "text-2xl font-semibold text-slate-900", children: currency(month.disbursed) })] }), _jsx("span", { className: "rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500", children: currency(month.totalToPay) })] }), _jsx("div", { className: "mt-4 h-1.5 w-full rounded-full bg-slate-100", children: _jsx("span", { className: "block h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600", style: { width: `${Math.max(coverage * 100, coverage > 0 ? 8 : 0)}%` } }) }), _jsxs("dl", { className: "mt-4 grid gap-2 text-slate-600", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-400", children: "Pendiente" }), _jsx("dd", { className: "text-base font-semibold text-amber-600", children: currency(month.pending) })] }), _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-400", children: "Total a desembolsar" }), _jsx("dd", { className: "text-base font-semibold text-slate-900", children: currency(month.totalToPay) })] })] }), detailItems.length ? (_jsx("div", { className: "mt-4 space-y-2", children: detailItems.map(item => (_jsxs("div", { className: "rounded-2xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-semibold text-slate-500", children: item.label }), _jsx("span", { className: "text-slate-900", children: currency(item.value) })] }), item.parts?.length ? (_jsx("p", { className: "mt-1 text-[10px] text-slate-500", children: item.parts.map((part, idx) => (_jsxs("span", { children: [_jsx("span", { className: "font-semibold text-slate-600", children: part.label }), ' ', currency(part.value), idx === item.parts.length - 1 ? '' : ' · '] }, part.key))) })) : null] }, `${month.id}-${item.key}`))) })) : null] }, `summary-month-${month.id}`));
                                                        }), _jsxs("article", { className: "flex min-w-[280px] flex-col justify-between rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white p-5 text-sm shadow-md shadow-slate-100 ring-1 ring-sky-100", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500", children: "Acumulado general" }), _jsx("p", { className: "mt-3 text-[11px] font-semibold uppercase tracking-wide text-sky-700", children: "Total desembolsado" }), _jsx("p", { className: "text-2xl font-semibold text-sky-800", children: currency(accumulationDisbursement.totalDisbursed) })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-wide text-amber-600", children: "Pendiente" }), _jsx("p", { className: "text-xl font-semibold text-amber-600", children: currency(accumulationDisbursement.pending) })] })] }), _jsx("dl", { className: "mt-4 grid gap-2 text-slate-700", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-500", children: "Total a desembolsar" }), _jsx("dd", { className: "text-base font-semibold text-slate-900", children: currency(accumulationDisbursement.totalToPay) })] }) }), _jsxs("div", { className: "mt-4 grid gap-2 text-[11px] text-slate-600", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: "Adelantos" }), _jsx("span", { className: "font-semibold text-slate-900", children: currency(accumulationDisbursement.extras.advances) })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: "Feriados" }), _jsx("span", { className: "font-semibold text-slate-900", children: currency(accumulationDisbursement.extras.holidays) })] }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: "Horas extra" }), _jsx("span", { className: "font-semibold text-slate-900", children: currency(accumulationDisbursement.extras.overtime) })] }), accumulationDisbursement.extras.bonuses > 0 && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: "Bonificaciones" }), _jsx("span", { className: "font-semibold text-slate-900", children: currency(accumulationDisbursement.extras.bonuses) })] })), accumulationSummary.totalDeductions > 0 && (_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { children: "Descuentos" }), _jsx("span", { className: "font-semibold text-slate-900", children: currency(accumulationSummary.totalDeductions) })] }))] })] })] }) }), _jsx("div", { className: "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3", children: summaryCardAreas.map(area => {
                                                    const extras = area.extras;
                                                    const extrasTotal = extras.advances + extras.holidays + extras.overtime + extras.bonuses;
                                                    const netPaidArea = area.data.netPaid;
                                                    const pendingArea = area.data.netPending;
                                                    const areaDisbursed = netPaidArea + extrasTotal;
                                                    const areaDetails = [];
                                                    if (extras.advances > 0)
                                                        areaDetails.push({ key: 'advances', label: 'Adelantos', value: extras.advances });
                                                    if (extras.holidays > 0)
                                                        areaDetails.push({ key: 'holidays', label: 'Feriados', value: extras.holidays });
                                                    if (extras.overtime > 0)
                                                        areaDetails.push({ key: 'overtime', label: 'Horas extra', value: extras.overtime });
                                                    if (extras.bonuses > 0)
                                                        areaDetails.push({ key: 'bonuses', label: 'Bonificaciones', value: extras.bonuses });
                                                    return (_jsxs("article", { className: "rounded-3xl border border-slate-100 bg-white/90 p-5 text-sm shadow-sm shadow-slate-100 ring-1 ring-transparent transition duration-200 hover:-translate-y-1 hover:ring-slate-200", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-400", children: area.label }), _jsx("p", { className: "mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500", children: "Total desembolsado" }), _jsx("p", { className: "text-xl font-semibold text-slate-900", children: currency(areaDisbursed) })] }), _jsx("span", { className: `rounded-full px-3 py-1 text-[11px] font-semibold ${pendingArea > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`, children: pendingArea > 0 ? 'Pendiente' : 'Al día' })] }), _jsxs("dl", { className: "mt-4 grid gap-2 text-slate-600", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-400", children: "Pendiente" }), _jsx("dd", { className: "text-base font-semibold text-amber-600", children: currency(pendingArea) })] }), _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("dt", { className: "text-xs uppercase tracking-wide text-slate-400", children: "Descuentos" }), _jsx("dd", { className: "text-base font-semibold text-slate-900", children: currency(area.data.totalDeductions) })] })] }), areaDetails.length ? (_jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: areaDetails.map(item => (_jsx("div", { className: "rounded-2xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "font-semibold text-slate-500", children: item.label }), _jsx("span", { className: "text-slate-900", children: currency(item.value) })] }) }, `${area.key}-${item.key}`))) })) : null] }, `summary-area-${area.key}`));
                                                }) })] })) : (_jsx("p", { className: "mt-4 text-sm text-slate-600", children: "Agrega periodos al acumulado para ver cu\u00E1nto se desembols\u00F3 cada mes." })), _jsx("p", { className: "mt-4 text-[11px] text-slate-500", children: "Descuentos = faltas, permisos sin goce, tardanzas y sanciones registradas. No se descuenta el tiempo que a\u00FAn no se trabaja (prorrateos por ingreso en mitad de mes)." })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsx("h2", { className: "mb-3 text-lg font-semibold text-slate-700", children: editingPeriodId ? 'Editar periodo de planilla' : 'Nuevo periodo de planilla' }), periodAlert && (_jsx("p", { className: "mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700", children: periodAlert })), editingPeriodId && (_jsxs("p", { className: "mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700", children: ["Editando periodo ", MONTH_NAMES[Math.min(Math.max(periodForm.month, 1), 12) - 1], " ", periodForm.year, ".", ' ', "Ajusta los datos y guarda los cambios o cancela la edici\u00F3n."] })), _jsxs("form", { className: "flex flex-col gap-3", onSubmit: handleSubmitPeriod, children: [_jsxs("div", { className: "flex gap-3", children: [_jsxs("label", { className: "text-sm text-slate-600", children: ["Mes", _jsx(SearchableSelect, { value: periodForm.month, options: MONTH_SELECT_OPTIONS, onChange: (selected, input) => {
                                                                    if (selected !== null) {
                                                                        setPeriodForm(prev => ({ ...prev, month: selected }));
                                                                    }
                                                                    else if (!input.trim()) {
                                                                        setPeriodForm(prev => ({ ...prev, month: new Date().getMonth() + 1 }));
                                                                    }
                                                                }, placeholder: "Mes (1-12)" })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["A\u00F1o", _jsx("input", { type: "number", min: "2020", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: periodForm.year, onChange: event => setPeriodForm(prev => ({ ...prev, year: Number(event.target.value) })) })] })] }), _jsxs("label", { className: "text-sm text-slate-600", children: ["D\u00EDas laborables", _jsx("input", { type: "number", min: "20", max: "31", className: "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm", value: periodForm.workingDays, onChange: event => setPeriodForm(prev => ({
                                                            ...prev,
                                                            workingDays: Number(event.target.value),
                                                            fixedThirtyDays: prev.fixedThirtyDays && Number(event.target.value) === 30,
                                                        })), disabled: periodForm.fixedThirtyDays })] }), _jsxs("label", { className: "flex items-start gap-2 text-xs text-slate-600", children: [_jsx("input", { type: "checkbox", className: "mt-1", checked: periodForm.fixedThirtyDays, onChange: event => setPeriodForm(prev => ({
                                                            ...prev,
                                                            fixedThirtyDays: event.target.checked,
                                                            workingDays: event.target.checked ? 30 : prev.workingDays,
                                                        })) }), _jsx("span", { children: "Mes contable cerrado de 30 d\u00EDas. Mant\u00E9n activo para que todos los sueldos partan de 30 d\u00EDas y solo var\u00EDen por faltas, permisos o bonos." })] }), _jsx("textarea", { className: "min-h-[80px] rounded border border-slate-300 px-3 py-2 text-sm", placeholder: "Notas de la planilla (opcional)", value: periodForm.notes, onChange: event => setPeriodForm(prev => ({ ...prev, notes: event.target.value })) }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "submit", className: "rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700", children: editingPeriodId ? 'Guardar cambios' : 'Crear periodo' }), editingPeriodId && (_jsx("button", { type: "button", className: "rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50", onClick: handleCancelPeriodEdit, children: "Cancelar" }))] })] })] }), _jsxs("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-slate-700", children: "Periodos" }), periodsLoading && _jsx("span", { className: "text-xs text-slate-400", children: "Cargando\u2026" })] }), _jsx("div", { className: "max-h-[300px] overflow-y-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Periodo" }), _jsx("th", { className: "px-3 py-2", children: "Estado" }), _jsx("th", { className: "px-3 py-2 text-right", children: "D\u00EDas" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Acciones" })] }) }), _jsxs("tbody", { children: [periods.map(period => {
                                                            const isEditing = editingPeriodId === period.id;
                                                            return (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2", children: _jsxs("button", { type: "button", onClick: () => handleSelectPeriod(period.id), className: `text-left font-medium ${selectedPeriodId === period.id ? 'text-blue-600' : 'text-slate-700'}`, children: [MONTH_NAMES[period.month - 1], " ", period.year] }) }), _jsx("td", { className: "px-3 py-2 text-slate-600", children: PERIOD_STATUS_LABEL[period.status] }), _jsx("td", { className: "px-3 py-2 text-right text-slate-600", children: period.workingDays }), _jsx("td", { className: "px-3 py-2 text-right text-xs", children: _jsxs("div", { className: "flex justify-end gap-2", children: [period.status !== 'CLOSED' && (_jsx("button", { type: "button", className: `rounded border border-slate-300 px-2 py-1 ${isEditing ? 'cursor-default bg-slate-100 text-slate-400' : ''}`, onClick: () => handleEditPeriod(period), disabled: isEditing, children: isEditing ? 'Editando' : 'Editar' })), _jsx("button", { type: "button", className: "rounded border border-slate-300 px-2 py-1", onClick: () => handleGeneratePeriod(period), children: "Generar" }), period.status !== 'CLOSED' && (_jsx("button", { type: "button", className: "rounded border border-rose-300 px-2 py-1 text-rose-600", onClick: () => handleClosePeriod(period.id), children: "Cerrar" }))] }) })] }, period.id));
                                                        }), !periods.length && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "px-3 py-6 text-center text-sm text-slate-500", children: "A\u00FAn no creas periodos para esta obra." }) }))] })] }) })] })] }), _jsx("div", { className: "space-y-6", children: _jsx("div", { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", children: selectedPeriodId && periodDetails ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("header", { className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-lg font-semibold text-slate-700", children: ["Boletas ", MONTH_NAMES[periodDetails.month - 1], " ", periodDetails.year] }), _jsxs("p", { className: "text-xs text-slate-500", children: [periodDetails.entries.length, " colaboradores \u00B7 Estado: ", PERIOD_STATUS_LABEL[periodDetails.status]] })] }), _jsx("div", { className: "w-full md:w-64", children: _jsx("input", { type: "text", className: "w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200", placeholder: "Buscar trabajador", value: periodEntrySearch, onChange: event => setPeriodEntrySearch(event.target.value) }) })] }), _jsx("div", { className: "max-h-[260px] overflow-y-auto rounded border border-slate-100", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Trabajador" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Sueldo base" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Feriados" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Descuentos" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Ajustes" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Neto" })] }) }), _jsxs("tbody", { children: [filteredPeriodEntries.map(entry => {
                                                            const monthlyBase = entry.details?.breakdown?.monthlyBase ?? entry.baseSalary;
                                                            const totalDeductions = resolveActualDeductions(entry);
                                                            return (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2 text-slate-700", children: _jsx("button", { type: "button", onClick: () => setEntryForm(prev => ({ ...prev, entryId: String(entry.id) })), className: `text-left ${entryForm.entryId === String(entry.id) ? 'text-blue-600' : ''}`, children: employeeName(entry.employee) }) }), _jsx("td", { className: "px-3 py-2 text-right text-slate-600", children: currency(monthlyBase) }), _jsx("td", { className: "px-3 py-2 text-right text-blue-600", children: currency(entry.holidayBonus ?? 0) }), _jsx("td", { className: "px-3 py-2 text-right text-rose-600", children: currency(totalDeductions) }), _jsx("td", { className: "px-3 py-2 text-right text-green-600", children: currency(entry.bonusesTotal) }), _jsx("td", { className: "px-3 py-2 text-right font-semibold text-slate-800", children: currency(entry.netPay) })] }, entry.id));
                                                        }), !filteredPeriodEntries.length && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-3 py-6 text-center text-sm text-slate-500", children: periodEntries.length
                                                                    ? 'No se encontraron boletas para esa búsqueda.'
                                                                    : 'Genera la planilla para ver las boletas.' }) }))] })] }) }), chosenEntry && (_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600", children: [_jsxs("h3", { className: "mb-2 font-semibold text-slate-700", children: ["Detalle de ", employeeName(chosenEntry.employee)] }), _jsxs("ul", { className: "space-y-1", children: [_jsxs("li", { children: ["Sueldo mensual: ", currency(chosenEntrySummary?.monthlyBase ?? chosenEntry.baseSalary), " \u00B7 Prorrateado:", ' ', currency(chosenEntrySummary?.proratedBase ?? chosenEntry.baseSalary)] }), _jsxs("li", { children: ["D\u00EDas remunerados: ", chosenEntrySummary?.daysDisplay ?? '—', chosenEntrySummary?.startDate &&
                                                                        ` · Fecha de ingreso: ${formatIsoDate(chosenEntrySummary.startDate)}`] }), _jsxs("li", { children: ["Asistencias: ", chosenEntrySummary?.workedDays ?? chosenEntry.workedDays, " d\u00EDas / Faltas:", ' ', chosenEntrySummary?.absenceDays ?? chosenEntry.absenceDays, attendancePenaltyDays > 0 && (_jsxs("span", { className: "block text-xs text-slate-500", children: [recordedAbsenceDays, " faltas registradas + ", attendancePenaltyDays, " domingo(s) descontado(s)"] }))] }), _jsxs("li", { children: ["Tardanzas: ", chosenEntrySummary?.tardinessMinutes ?? chosenEntry.tardinessMinutes, " min / Permisos sin goce:", ' ', chosenEntrySummary?.permissionDaysRecorded ?? chosenEntry.permissionDays, " d\u00EDas (", fixed2(chosenEntrySummary?.permissionHours ?? chosenEntry.permissionHours), " h)"] }), _jsxs("li", { children: ["Feriados trabajados: ", chosenEntry.holidayDays, " d\u00EDas \u00B7 Bono: ", currency(chosenEntry.holidayBonus ?? 0)] }), _jsxs("li", { children: ["Domingos trabajados:", ' ', chosenEntrySummary?.weekendSundayDays ?? chosenEntry?.details?.attendance?.weekendSundayDays ?? 0, " \u00B7 Bono:", ' ', currency(chosenEntrySummary?.weekendSundayBonus ?? 0)] }), _jsxs("li", { children: ["Pensi\u00F3n: ", currency(chosenEntry.pensionAmount), " \u00B7 Essalud: ", currency(chosenEntry.healthAmount)] })] }), chosenEntrySummary && (_jsxs("div", { className: "mt-3 grid gap-2 md:grid-cols-2", children: [_jsxs("div", { className: "rounded border border-blue-200 bg-white p-2", children: [_jsx("h4", { className: "text-xs font-semibold uppercase text-blue-700", children: "Haberes percibidos" }), _jsxs("ul", { className: "mt-1 space-y-1 text-xs text-slate-600", children: [_jsxs("li", { children: ["Remuneraci\u00F3n consolidada: ", currency(chosenEntrySummary.remuneration)] }), _jsxs("li", { children: ["Horas extras: ", currency(chosenEntrySummary.overtime)] }), _jsxs("li", { children: ["Feriados: ", currency(chosenEntrySummary.feriados)] }), _jsxs("li", { children: ["Domingos trabajados (", chosenEntrySummary.weekendSundayDays, "):", ' ', currency(chosenEntrySummary.weekendSundayBonus)] }), _jsxs("li", { children: ["Bonos adicionales: ", currency(chosenEntrySummary.manualBonuses)] })] })] }), _jsxs("div", { className: "rounded border border-rose-200 bg-white p-2", children: [_jsx("h4", { className: "text-xs font-semibold uppercase text-rose-700", children: "Descuentos" }), _jsxs("ul", { className: "mt-1 space-y-1 text-xs text-slate-600", children: [_jsxs("li", { children: ["Faltas: ", currency(chosenEntrySummary.faltas)] }), attendancePenaltyDays > 0 && (_jsxs("li", { className: "text-[11px] text-slate-500", children: ["(Incluye ", attendancePenaltyDays, " domingo(s) adicionales por faltas)"] })), _jsxs("li", { children: ["Permisos: ", currency(chosenEntrySummary.permisos)] }), _jsxs("li", { children: ["Adelantos: ", currency(chosenEntrySummary.manualAdvances)] }), _jsxs("li", { children: ["Penalidades: ", currency(chosenEntrySummary.manualDeductions + chosenEntrySummary.tardiness)] })] })] })] })), _jsxs("div", { className: "mt-3", children: [_jsx("h4", { className: "text-sm font-semibold text-slate-700", children: "Ajustes" }), _jsxs("ul", { className: "mt-1 space-y-1", children: [chosenEntry.adjustments?.map(adj => (_jsxs("li", { className: "flex items-start justify-between gap-3 rounded border border-slate-200 bg-white px-2 py-1", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase text-slate-500", children: ADJUSTMENT_LABELS[adj.type] }), _jsx("p", { className: "text-sm text-slate-700", children: adj.concept })] }), _jsxs("div", { className: "text-right", children: [_jsxs("p", { className: `text-sm font-semibold ${adj.type === 'BONUS' ? 'text-green-600' : 'text-rose-600'}`, children: [adj.type === 'BONUS' ? '+' : '-', currency(adj.amount)] }), _jsx("button", { type: "button", className: "text-xs text-rose-600 hover:underline", onClick: () => handleDeleteAdjustment(adj), children: "Quitar" })] })] }, adj.id))), !chosenEntry.adjustments?.length && (_jsx("li", { className: "rounded border border-dashed border-slate-200 px-2 py-1 text-xs", children: "Sin ajustes manuales." }))] })] })] }), _jsxs("div", { className: "rounded border border-slate-200 bg-white p-3", children: [_jsx("h3", { className: "mb-2 text-sm font-semibold text-slate-700", children: "Agregar ajuste" }), _jsx("p", { className: "mb-2 text-xs text-slate-500", children: "Selecciona \u201CAdelanto de sueldo\u201D para registrar adelantos y descontarlos inmediatamente del neto." }), entryAlert && (_jsx("p", { className: "mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700", children: entryAlert })), _jsxs("form", { className: "flex flex-col gap-2", onSubmit: handleAddAdjustment, children: [_jsx(SearchableSelect, { value: entryForm.type, options: ADJUSTMENT_SELECT_OPTIONS, onChange: (selected, input) => {
                                                                    if (selected)
                                                                        handleAdjustmentFormChange('type', selected);
                                                                    else if (!input.trim())
                                                                        handleAdjustmentFormChange('type', 'BONUS');
                                                                }, placeholder: "Tipo de ajuste (bono, descuento o adelanto)" }), _jsx("input", { className: "rounded border border-slate-300 px-2 py-1 text-sm", placeholder: entryForm.type === 'ADVANCE' ? 'Adelanto de sueldo' : 'Concepto', value: entryForm.concept, onChange: event => handleAdjustmentFormChange('concept', event.target.value), required: true }), _jsx("input", { type: "number", min: "0", step: "0.01", className: "rounded border border-slate-300 px-2 py-1 text-sm", placeholder: "Monto", value: entryForm.amount, onChange: event => handleAdjustmentFormChange('amount', event.target.value), required: true }), _jsx("button", { type: "submit", className: "rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700", children: "Guardar ajuste" })] }), chosenEntry && periodDetails && (_jsx("button", { type: "button", className: "mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100", onClick: () => handlePrintBoleta(chosenEntry, periodDetails), children: "Imprimir boleta" }))] })] })), periodDetails && periodTotals && periodEntries.length > 0 && (_jsxs("div", { className: "rounded border border-slate-200 bg-white p-4", children: [_jsxs("div", { className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsxs("h3", { className: "text-base font-semibold text-slate-700", children: ["Resumen mensual ", MONTH_NAMES[periodDetails.month - 1], " ", periodDetails.year] }), _jsxs("p", { className: "text-xs text-slate-500", children: [periodDetails.entries.length, " boleta", periodDetails.entries.length === 1 ? '' : 's', " \u00B7 Estado:", ' ', PERIOD_STATUS_LABEL[periodDetails.status]] })] }), _jsxs("div", { className: "text-right", children: [_jsx("p", { className: "text-xs uppercase text-slate-500", children: "Total neto a pagar" }), _jsx("p", { className: "text-2xl font-semibold text-slate-800", children: currency(periodTotals.net) })] })] }), _jsx("dl", { className: "mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6", children: periodSummaryStats.map(stat => (_jsxs("div", { children: [_jsx("dt", { className: "text-xs uppercase text-slate-500", children: stat.label }), _jsx("dd", { className: "text-lg font-semibold text-slate-700", children: currency(stat.value) })] }, stat.key))) }), _jsxs("div", { className: "mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between", children: [_jsx("p", { className: "text-xs text-slate-500", children: "Usa esta suma para estimar el pago total del mes. Puedes imprimir todas las boletas en un solo PDF." }), _jsx("button", { type: "button", className: "rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900", onClick: handlePrintAllBoletas, children: "Generar planillas del mes" })] })] })), periodDetails && (_jsxs("div", { className: "rounded border border-slate-200 bg-white p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-base font-semibold text-slate-700", children: "Reporte detallado por \u00E1rea" }), _jsx("button", { type: "button", className: "rounded border border-slate-300 px-3 py-1 text-xs", onClick: () => setShowAreaReport(prev => !prev), children: showAreaReport ? 'Ocultar' : 'Ver reporte' })] }), showAreaReport && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs", children: [AREA_FILTER_BUTTONS.map(option => (_jsx("button", { type: "button", onClick: () => setReportAreaFilter(option.value), className: `rounded-full border px-3 py-1 font-semibold ${reportAreaFilter === option.value
                                                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                                                    : 'border-slate-300 text-slate-600'}`, children: option.label }, `report-${option.value}`))), accumulationSummary.months.length > 0 && (_jsx("span", { className: "ml-auto rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600", children: accumulationSummary.ready
                                                                    ? `Acumulado (${accumulationSummary.months.length ? accumulationSummary.months.map(month => month.label).join(', ') : 'Sin periodos seleccionados'}): Neto ${currency(accumulationDisplay.total)} · Pagado ${currency(accumulationDisplay.totalPaid)} · Descuentos ${currency(accumulationDisplay.totalDeductions)}`
                                                                    : 'Calculando acumulado…' }))] }), accumulationOptions.length > 0 && (_jsxs("div", { className: "mt-3 rounded border border-slate-200 p-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-slate-600", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Periodos para el acumulado" }), _jsxs("button", { type: "button", className: "rounded border border-blue-500 px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50", onClick: handleSelectLatestPeriods, disabled: !sortedPeriodsDesc.length, children: ["\u00DAltimos ", DEFAULT_ACCUMULATION_MONTHS] }), _jsxs("span", { className: "text-[11px] text-slate-500", children: ["Selecciona hasta ", MAX_ACCUMULATION_MONTHS, " periodos."] })] }), _jsx("div", { className: "mt-2 flex flex-wrap gap-2", children: accumulationOptions.map(period => {
                                                                    const label = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
                                                                    const selected = accumulationSelection.includes(period.id);
                                                                    return (_jsx("button", { type: "button", onClick: () => toggleAccumulationPeriod(period.id), className: `rounded-full border px-3 py-1 text-xs font-semibold ${selected
                                                                            ? 'border-blue-500 bg-blue-100 text-blue-700'
                                                                            : 'border-slate-300 text-slate-600'}`, children: label }, `acc-option-${period.id}`));
                                                                }) })] })), accumulationSummary.months.length > 0 && (_jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Estado de pago:" }), ['ALL', 'PAID', 'UNPAID'].map(option => (_jsxs("button", { type: "button", onClick: () => setAccumulationPaymentFilter(option), className: `rounded-full border px-3 py-1 font-semibold ${accumulationPaymentFilter === option
                                                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                                                    : 'border-slate-300 text-slate-600'}`, children: [option === 'ALL' && 'Todos', option === 'PAID' && 'Pagados', option === 'UNPAID' && 'Pendientes'] }, `acc-filter-${option}`))), _jsx("span", { className: "text-[11px] text-slate-500", children: "Marca cada colaborador cuando se deposite su sueldo." }), accumulationPaymentAlert && (_jsx("span", { className: "text-[11px] font-semibold text-rose-600", children: accumulationPaymentAlert }))] })), accumulationSummary.months.length > 0 && (_jsxs("div", { className: "mt-2 flex flex-wrap items-center gap-2 text-xs", children: [_jsx("span", { className: "font-semibold text-slate-700", children: "Filtro por cuenta:" }), ['ALL', 'WITH', 'WITHOUT'].map(option => (_jsxs("button", { type: "button", onClick: () => setAccumulationAccountFilter(option), className: `rounded-full border px-3 py-1 font-semibold ${accumulationAccountFilter === option
                                                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                                                    : 'border-slate-300 text-slate-600'}`, children: [option === 'ALL' && 'Todos', option === 'WITH' && 'Con cuenta', option === 'WITHOUT' && 'Sin cuenta'] }, `acc-account-${option}`))), _jsx("span", { className: "text-[11px] text-slate-500", children: "Filtra qui\u00E9n ya tiene datos bancarios cargados." })] })), !areaReportRows.length ? (_jsx("p", { className: "mt-3 text-sm text-slate-500", children: "No hay colaboradores asignados al filtro seleccionado." })) : ((() => {
                                                        const areaLabel = reportAreaFilter === 'ALL'
                                                            ? 'Todas las áreas'
                                                            : EMPLOYEE_AREA_LABELS[reportAreaFilter];
                                                        return (_jsxs(_Fragment, { children: [_jsx("div", { className: "mt-3 overflow-x-auto", children: _jsxs("table", { className: "min-w-full text-xs sm:text-sm", children: [_jsx("thead", { className: "bg-slate-100 text-left uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Trabajador" }), _jsx("th", { className: "px-3 py-2", children: "Sueldo mensual" }), _jsx("th", { className: "px-3 py-2", children: "Prorrateado" }), _jsx("th", { className: "px-3 py-2", children: "D\u00EDas remunerados" }), _jsx("th", { className: "px-3 py-2", children: "Asistencias / Faltas" }), _jsx("th", { className: "px-3 py-2", children: "Tardanzas / Permisos" }), _jsx("th", { className: "px-3 py-2", children: "Feriados" }), _jsx("th", { className: "px-3 py-2", children: "Descuentos" }), _jsx("th", { className: "px-3 py-2", children: "Ajustes" }), _jsx("th", { className: "px-3 py-2", children: "Sueldo neto" })] }) }), _jsx("tbody", { children: areaReportRows.map(({ entry, summary }) => {
                                                                                    const deductions = summary.actualDeductions;
                                                                                    return (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2 font-medium text-slate-700", children: employeeName(entry.employee) }), _jsx("td", { className: "px-3 py-2", children: currency(summary.monthlyBase) }), _jsx("td", { className: "px-3 py-2", children: currency(summary.proratedBase) }), _jsxs("td", { className: "px-3 py-2", children: [_jsx("div", { children: summary.daysDisplay }), summary.startDate && (_jsxs("div", { className: "text-[11px] text-slate-500", children: ["Ingreso: ", formatIsoDate(summary.startDate)] }))] }), _jsxs("td", { className: "px-3 py-2", children: [summary.workedDays, " / ", summary.absenceDays] }), _jsxs("td", { className: "px-3 py-2", children: [summary.tardinessMinutes, " min \u00B7 ", summary.permissionDaysRecorded, "d (", fixed2(summary.permissionHours), " h)"] }), _jsxs("td", { className: "px-3 py-2", children: [summary.holidayDays, " d\u00EDas \u00B7 ", currency(summary.holidayBonus)] }), _jsx("td", { className: "px-3 py-2 text-rose-600", children: currency(deductions) }), _jsx("td", { className: "px-3 py-2 text-blue-600", children: currency(entry.bonusesTotal ?? 0) }), _jsx("td", { className: "px-3 py-2 font-semibold text-slate-800", children: currency(entry.netPay) })] }, `report-row-${entry.id}`));
                                                                                }) }), _jsx("tfoot", { children: _jsxs("tr", { className: "border-t border-slate-300 font-semibold", children: [_jsx("td", { className: "px-3 py-2", colSpan: 9, children: "Total neto del \u00E1rea" }), _jsx("td", { className: "px-3 py-2 text-right", children: currency(areaReportNetTotal) })] }) })] }) }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center justify-between gap-3", children: [_jsxs("p", { className: "text-sm font-semibold text-slate-700", children: ["Total neto (", areaLabel, "): ", currency(areaReportNetTotal)] }), _jsx("button", { type: "button", className: "rounded border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50", onClick: handlePrintAreaReport, children: "Imprimir reporte por \u00E1rea" })] }), accumulationSummary.months.length > 0 && (_jsxs("div", { className: "mt-6", children: [_jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("h4", { className: "text-sm font-semibold text-slate-700", children: ["Acumulado hist\u00F3rico (", accumulationSummary.months.length ? accumulationSummary.months.map(month => month.label).join(', ') : 'Sin periodos seleccionados', ")"] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [(!accumulationSummary.ready || accumulationLoading) && (_jsx("span", { className: "text-xs text-slate-500", children: "Calculando acumulado\u2026" })), _jsx("button", { type: "button", className: "rounded border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60", onClick: handlePrintAccumulationReport, disabled: !accumulationSummary.ready ||
                                                                                                !accumulationDisplay.rows.length ||
                                                                                                accumulationLoading, children: "Imprimir acumulado" })] })] }), accumulationSummary.ready && accumulationSummary.months.length > 0 && (_jsx("p", { className: "mt-1 text-[11px] text-slate-500", children: "Cada celda muestra primero el neto del mes y debajo el total pagado (neto + adelantos)." })), !accumulationSummary.ready || accumulationLoading ? (_jsx("p", { className: "mt-2 text-sm text-slate-500", children: "Estamos trayendo las planillas de los \u00FAltimos meses, espera un momento." })) : !accumulationDisplay.rows.length ? (_jsxs("p", { className: "mt-2 text-sm text-slate-500", children: ["No hay montos registrados para ", areaLabel, " con el filtro actual."] })) : (_jsx("div", { className: "mt-2 overflow-x-auto", children: _jsxs("table", { className: "min-w-full text-xs sm:text-sm", children: [_jsx("thead", { className: "bg-slate-50 text-left uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Trabajador" }), accumulationSummary.months.map(month => (_jsx("th", { className: "px-3 py-2", children: month.label }, `acc-month-${month.id}`))), _jsx("th", { className: "px-3 py-2", children: "Acumulado" }), _jsx("th", { className: "px-3 py-2", children: "Pagado total" }), _jsx("th", { className: "px-3 py-2", children: "Descuentos" }), _jsx("th", { className: "px-3 py-2", children: "Banco" }), _jsx("th", { className: "px-3 py-2", children: "Cuenta bancaria" }), _jsx("th", { className: "px-3 py-2", children: "CCI" }), _jsx("th", { className: "px-3 py-2", children: "Yape/Plin" }), _jsx("th", { className: "px-3 py-2", children: "Pagado" })] }) }), _jsx("tbody", { children: accumulationDisplay.rows.map(row => (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2 font-medium text-slate-700", children: employeeName(row.employee) }), accumulationSummary.months.map((_month, index) => {
                                                                                                    const netValue = row.perMonth[index] ?? 0;
                                                                                                    const paidValue = row.perMonthPaid[index] ?? netValue;
                                                                                                    return (_jsxs("td", { className: "px-3 py-2", children: [_jsx("div", { children: currency(netValue) }), _jsxs("div", { className: "text-[11px] text-slate-500", children: ["Pagado: ", currency(paidValue)] })] }, `acc-cell-${row.employeeId}-${index}`));
                                                                                                }), _jsx("td", { className: "px-3 py-2 font-semibold text-slate-800", children: currency(row.total) }), _jsx("td", { className: "px-3 py-2 font-semibold text-slate-800", children: currency(row.totalPaid) }), _jsx("td", { className: "px-3 py-2 text-rose-600", children: currency(row.totalDeductions) }), _jsx("td", { className: "px-3 py-2", children: row.bank || '—' }), _jsx("td", { className: "px-3 py-2", children: row.account || '—' }), _jsx("td", { className: "px-3 py-2", children: row.cci || '—' }), _jsx("td", { className: "px-3 py-2", children: row.yapePlin || '—' }), _jsx("td", { className: "px-3 py-2", children: (() => {
                                                                                                        const paid = Boolean(accumulationPayments[row.employeeId]);
                                                                                                        const saving = Boolean(accumulationPaymentSaving[row.employeeId]);
                                                                                                        const badgeClass = paid
                                                                                                            ? 'bg-green-100 text-green-700'
                                                                                                            : 'bg-amber-100 text-amber-700';
                                                                                                        return (_jsxs("div", { className: "flex flex-col gap-1 text-xs", children: [_jsx("span", { className: `inline-flex items-center justify-center rounded-full px-3 py-0.5 font-semibold ${badgeClass}`, children: paid ? 'Pagado' : 'Pendiente' }), paid ? (_jsx("button", { type: "button", className: "text-left font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400", disabled: !deleteUnlocked || saving, onClick: () => handleAccumulationPaymentChange(row.employeeId, false), children: saving ? 'Actualizando…' : 'Marcar como pendiente' })) : (_jsx("button", { type: "button", className: "text-left font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400", disabled: saving, onClick: () => handleAccumulationPaymentChange(row.employeeId, true), children: saving ? 'Guardando…' : 'Marcar como pagado' })), paid && !deleteUnlocked && (_jsx("span", { className: "text-[10px] text-slate-400", children: "Protegido. Desbloquea Seguridad para editar." }))] }));
                                                                                                    })() })] }, `acc-row-${row.employeeId}`))) }), _jsx("tfoot", { children: _jsxs("tr", { className: "border-t border-slate-200 font-semibold", children: [_jsxs("td", { className: "px-3 py-2", children: ["Subtotal ", areaLabel] }), accumulationDisplay.monthTotals.map((value, index) => (_jsxs("td", { className: "px-3 py-2", children: [_jsx("div", { children: currency(value) }), _jsxs("div", { className: "text-[11px] text-slate-500", children: ["Pagado: ", currency(accumulationDisplay.monthTotalsPaid[index] ?? 0)] }), _jsxs("div", { className: "text-[11px] text-rose-600", children: ["Desc.: ", currency(accumulationDisplay.monthTotalsDeductions[index] ?? 0)] })] }, `acc-total-${index}`))), _jsx("td", { className: "px-3 py-2", children: currency(accumulationDisplay.total) }), _jsx("td", { className: "px-3 py-2", children: currency(accumulationDisplay.totalPaid) }), _jsx("td", { className: "px-3 py-2 text-rose-600", children: currency(accumulationDisplay.totalDeductions) }), _jsx("td", { className: "px-3 py-2", children: "\u2014" }), _jsx("td", { className: "px-3 py-2", children: "\u2014" }), _jsx("td", { className: "px-3 py-2", children: "\u2014" }), _jsx("td", { className: "px-3 py-2", children: "\u2014" }), _jsx("td", { className: "px-3 py-2", children: "\u2014" })] }) })] }) }))] }))] }));
                                                    })())] }))] })), periodDetails && (_jsxs("div", { className: "rounded border border-slate-200 bg-white p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "text-base font-semibold text-slate-700", children: "Cuentas bancarias" }), _jsx("button", { type: "button", className: "rounded border border-slate-300 px-3 py-1 text-xs", onClick: () => setShowBankReport(prev => !prev), children: showBankReport ? 'Ocultar' : 'Ver cuentas' })] }), showBankReport && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mt-3 flex flex-wrap gap-2 text-xs", children: [['ALL', 'WITH', 'WITHOUT'].map(option => (_jsxs("button", { type: "button", onClick: () => setBankFilter(option), className: `rounded-full border px-3 py-1 font-semibold ${bankFilter === option
                                                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                                                    : 'border-slate-300 text-slate-600'}`, children: [option === 'ALL' && 'Todos', option === 'WITH' && 'Con cuenta', option === 'WITHOUT' && 'Sin cuenta'] }, `bank-filter-${option}`))), _jsx("button", { type: "button", className: "rounded border border-blue-500 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50", onClick: handlePrintBankReport, disabled: !filteredAccountsRows.length, children: "Imprimir cuentas" })] }), !filteredAccountsRows.length ? (_jsx("p", { className: "mt-3 text-sm text-slate-500", children: "No hay registros para este filtro." })) : (_jsx("div", { className: "mt-3 overflow-x-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { className: "bg-slate-100 text-left uppercase tracking-wide text-slate-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: "Trabajador" }), _jsx("th", { className: "px-3 py-2", children: "Banco" }), _jsx("th", { className: "px-3 py-2", children: "N\u00FAmero de cuenta" }), _jsx("th", { className: "px-3 py-2", children: "CCI" }), _jsx("th", { className: "px-3 py-2", children: "Yape/Plin" })] }) }), _jsx("tbody", { children: filteredAccountsRows.map(row => (_jsxs("tr", { className: "border-b border-slate-100", children: [_jsx("td", { className: "px-3 py-2 font-medium text-slate-700", children: row.worker }), _jsx("td", { className: "px-3 py-2", children: row.bank }), _jsx("td", { className: "px-3 py-2", children: row.account }), _jsx("td", { className: "px-3 py-2", children: row.cci }), _jsx("td", { className: "px-3 py-2", children: row.yapePlin })] }, `bank-row-${row.worker}`))) })] }) }))] }))] }))] })) : (_jsx("div", { className: "flex h-full items-center justify-center text-sm text-slate-500", children: "Selecciona un periodo para ver sus boletas." })) }) }), ")}"] })), "; }"] }));
}

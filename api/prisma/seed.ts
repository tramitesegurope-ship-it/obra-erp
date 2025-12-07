import {
  PrismaClient,
  IncomeStatus,
  ExpenseKind,
  type DocType,
  type ExpenseType,
  type PaymentMethod,
  type VariableType,
} from '@prisma/client';

const prisma = new PrismaClient();
const IGV_RATE = 0.18;

const round2 = (value: number) => Math.round(value * 100) / 100;

type IncomeSeed = {
  obra: string;
  frente?: string;
  description: string;
  docType: DocType;
  docSerie?: string;
  docNumero?: string;
  total: number;
  taxable?: boolean;
  igvRate?: number;
  date: string;
  status?: IncomeStatus;
};

type ExpenseSeed = {
  obra: string;
  frente?: string;
  proveedor?: string;
  material?: string;
  category?: string;
  description: string;
  docType: DocType;
  docSerie?: string;
  docNumero?: string;
  total: number;
  taxable?: boolean;
  igvRate?: number;
  date: string;
  type?: ExpenseType;
  variableType?: VariableType;
  paymentMethod?: PaymentMethod;
  quantity?: number;
  unitCost?: number;
  status?: string;
};

const OBRAS = [
  {
    name: 'Proyecto La Carbonera',
    code: 'OBR-001',
    frentes: [
      'Frente Centro',
      'Frente Norte',
      'Frente Sur',
      'Frente Este',
      'Frente Oeste',
    ],
  },
  {
    name: 'Rehabilitación Avenida Costanera',
    code: 'OBR-002',
    frentes: ['Tramo Norte', 'Tramo Sur'],
  },
];

const MATERIALS = [
  { name: 'Cemento Portland tipo I', code: 'MAT-0001', unit: 'bolsa' },
  { name: 'Arena fina', code: 'MAT-0002', unit: 'm³' },
  { name: 'Piedra chancada', code: 'MAT-0003', unit: 'm³' },
  { name: 'Acero corrugado 3/8"', code: 'MAT-0004', unit: 'kg' },
  { name: 'Acero corrugado 1/2"', code: 'MAT-0005', unit: 'kg' },
  { name: 'Ladrillo King Kong', code: 'MAT-0006', unit: 'millar' },
  { name: "Concreto premezclado f'c=210", code: 'MAT-0007', unit: 'm³' },
  { name: 'Tubería PVC 2"', code: 'MAT-0008', unit: 'unidad' },
  { name: 'Cable THHN #12', code: 'MAT-0009', unit: 'rollo' },
  { name: 'Pintura látex interior', code: 'MAT-0010', unit: 'galón' },
];

const PROVEEDORES = [
  { name: 'Aceros Arequipa', ruc: '20100070970', phone: '016166000' },
  { name: 'SiderPerú', ruc: '20100053868', phone: '044604400' },
  { name: 'Sodimac', ruc: '20341198217', phone: '017139000' },
  { name: 'Promart', ruc: '20521792030', phone: '016157000' },
  { name: 'Unicon', ruc: '20100071643', phone: '016147000' },
  { name: 'Ferreyros', ruc: '20100021585', phone: '016274800' },
];

const EXPENSE_CATEGORIES: Array<{ name: string; kind: ExpenseKind }> = [
  { name: 'Materiales — Compras (ingresa a almacén)', kind: ExpenseKind.MATERIAL_COMPRA },
  { name: 'Materiales — Consumo obra (salida de almacén)', kind: ExpenseKind.MATERIAL_CONSUMO },
  { name: 'Planillas y RR.HH.', kind: ExpenseKind.OPERATIVO },
  { name: 'Gastos administrativos (oficina central)', kind: ExpenseKind.ADMINISTRATIVO },
  { name: 'Alquileres y servicios generales', kind: ExpenseKind.OPERATIVO },
  { name: 'Transporte y logística (fletes, traslados)', kind: ExpenseKind.OPERATIVO },
  { name: 'Combustible y energía (equipos propios)', kind: ExpenseKind.OPERATIVO },
  { name: 'Seguros y garantías de obra', kind: ExpenseKind.FINANCIERO },
  { name: 'Otros financieros / penalidades', kind: ExpenseKind.OTROS },
];

const ADMIN_INCOMES: IncomeSeed[] = [
  {
    obra: 'Proyecto La Carbonera',
    frente: 'Frente Centro',
    description: 'Valorización octubre 2025',
    docType: 'FACTURA',
    docSerie: 'F001',
    docNumero: '000321',
    total: 85000,
    taxable: true,
    igvRate: 0.18,
    date: '2025-10-20',
    status: IncomeStatus.COBRADO,
  },
  {
    obra: 'Proyecto La Carbonera',
    description: 'Adelanto cliente — hito 1',
    docType: 'RECIBO',
    docSerie: 'RC01',
    docNumero: '000987',
    total: 30000,
    taxable: false,
    date: '2025-10-10',
    status: IncomeStatus.COBRADO,
  },
];

const ADMIN_EXPENSES: ExpenseSeed[] = [
  {
    obra: 'Proyecto La Carbonera',
    frente: 'Frente Centro',
    proveedor: 'Sodimac',
    material: 'Cemento Portland tipo I',
    category: 'Materiales — Compras (ingresa a almacén)',
    description: 'Compra de cemento para losa de fundación',
    docType: 'FACTURA',
    docSerie: 'F201',
    docNumero: '001245',
    total: 12500,
    taxable: true,
    igvRate: 0.18,
    date: '2025-10-12',
    type: 'DIRECTO',
    variableType: 'VARIABLE',
    paymentMethod: 'TRANSFERENCIA',
    quantity: 250,
    unitCost: 50,
    status: 'PAGADO',
  },
  {
    obra: 'Proyecto La Carbonera',
    frente: 'Frente Norte',
    proveedor: 'Ferreyros',
    category: 'Alquileres y servicios generales',
    description: 'Alquiler de retroexcavadora (semana 42)',
    docType: 'FACTURA',
    docSerie: 'F009',
    docNumero: '000112',
    total: 9500,
    taxable: true,
    igvRate: 0.18,
    date: '2025-10-18',
    type: 'DIRECTO',
    variableType: 'VARIABLE',
    paymentMethod: 'TRANSFERENCIA',
    status: 'PENDIENTE',
  },
  {
    obra: 'Proyecto La Carbonera',
    frente: 'Frente Centro',
    material: 'Cemento Portland tipo I',
    category: 'Materiales — Consumo obra (salida de almacén)',
    description: 'Consumo valorizado cimentación (semana 43)',
    docType: 'OTRO',
    total: 6200.4,
    taxable: false,
    date: '2025-10-22',
    type: 'DIRECTO',
    variableType: 'VARIABLE',
    paymentMethod: 'OTRO',
    quantity: 120,
    unitCost: 51.67,
    status: 'REGISTRADO',
  },
  {
    obra: 'Proyecto La Carbonera',
    category: 'Gastos administrativos (oficina central)',
    description: 'Viáticos equipo topografía',
    docType: 'BOLETA',
    docSerie: 'B001',
    docNumero: '000556',
    total: 1200,
    taxable: false,
    date: '2025-10-05',
    type: 'INDIRECTO',
    variableType: 'FIJO',
    paymentMethod: 'EFECTIVO',
    status: 'REGISTRADO',
  },
];

async function seedObras() {
  for (const obra of OBRAS) {
    const created = await prisma.obra.upsert({
      where: { name: obra.name },
      update: { code: obra.code ?? null },
      create: { name: obra.name, code: obra.code ?? null },
    });

    if (!obra.frentes?.length) continue;
    for (const frenteName of obra.frentes) {
      const existing = await prisma.frente.findFirst({
        where: { obraId: created.id, name: frenteName },
      });
      if (!existing) {
        await prisma.frente.create({
          data: { obraId: created.id, name: frenteName },
        });
      }
    }
  }
}

async function seedMaterials() {
  for (const material of MATERIALS) {
    await prisma.material.upsert({
      where: { code: material.code },
      update: { name: material.name, unit: material.unit },
      create: {
        name: material.name,
        code: material.code,
        unit: material.unit,
      },
    });
  }
}

async function seedProveedores() {
  for (const proveedor of PROVEEDORES) {
    await prisma.proveedor.upsert({
      where: { ruc: proveedor.ruc ?? '' },
      update: { name: proveedor.name, phone: proveedor.phone ?? null },
      create: {
        name: proveedor.name,
        ruc: proveedor.ruc ?? null,
        phone: proveedor.phone ?? null,
      },
    });
  }
}

async function seedExpenseCategories() {
  for (const { name, kind } of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: { kind },
      create: { name, kind },
    });
  }
}

async function seedAdminSamples() {
  const obras = await prisma.obra.findMany({ include: { frentes: true } });
  const proveedores = await prisma.proveedor.findMany();
  const materiales = await prisma.material.findMany();
  const categorias = await prisma.expenseCategory.findMany();

  let incomeCount = 0;
  for (const income of ADMIN_INCOMES) {
    const obra = obras.find((o) => o.name === income.obra);
    if (!obra) continue;
    const frente = income.frente
      ? obra.frentes.find((f) => f.name === income.frente)
      : undefined;

    const taxable = income.taxable ?? income.docType === 'FACTURA';
    const igvRate = taxable ? income.igvRate ?? IGV_RATE : 0;
    const base = taxable
      ? round2(income.total / (1 + igvRate))
      : round2(income.total);
    const igv = taxable ? round2(income.total - base) : 0;

    const existing = await prisma.income.findFirst({
      where: {
        obraId: obra.id,
        docSerie: income.docSerie?.toUpperCase() ?? null,
        docNumero: income.docNumero ?? null,
        description: income.description,
      },
    });
    if (existing) continue;

    await prisma.income.create({
      data: {
        obraId: obra.id,
        frenteId: frente?.id ?? null,
        description: income.description,
        docType: income.docType,
        docSerie: income.docSerie?.toUpperCase() ?? null,
        docNumero: income.docNumero ?? null,
        igvRate,
        isTaxable: taxable,
        base,
        igv,
        total: income.total,
        date: new Date(income.date),
        status: income.status ?? IncomeStatus.COBRADO,
      },
    });
    incomeCount += 1;
  }

  let expenseCount = 0;
  for (const expense of ADMIN_EXPENSES) {
    const obra = obras.find((o) => o.name === expense.obra);
    if (!obra) continue;

    const frente = expense.frente
      ? obra.frentes.find((f) => f.name === expense.frente)
      : undefined;
    const proveedor = expense.proveedor
      ? proveedores.find((p) => p.name === expense.proveedor)
      : undefined;
    const material = expense.material
      ? materiales.find((m) => m.name === expense.material)
      : undefined;
    const category = expense.category
      ? categorias.find((c) => c.name === expense.category)
      : undefined;

    const taxable = expense.taxable ?? expense.docType === 'FACTURA';
    const igvRate = taxable ? expense.igvRate ?? IGV_RATE : 0;
    const base = taxable
      ? round2(expense.total / (1 + igvRate))
      : round2(expense.total);
    const igv = taxable ? round2(expense.total - base) : 0;

    const existing = await prisma.expense.findFirst({
      where: {
        obraId: obra.id,
        docSerie: expense.docSerie?.toUpperCase() ?? null,
        docNumero: expense.docNumero ?? null,
        description: expense.description,
      },
    });
    if (existing) continue;

    await prisma.expense.create({
      data: {
        obraId: obra.id,
        frenteId: frente?.id ?? null,
        proveedorId: proveedor?.id ?? null,
        materialId: material?.id ?? null,
        categoryId: category?.id ?? null,
        docType: expense.docType,
        docSerie: expense.docSerie?.toUpperCase() ?? null,
        docNumero: expense.docNumero ?? null,
        date: new Date(expense.date),
        description: expense.description,
        type: expense.type ?? 'DIRECTO',
        variableType: expense.variableType ?? 'FIJO',
        quantity: expense.quantity ?? null,
        unitCost: expense.unitCost ?? null,
        igvRate,
        isTaxable: taxable,
        base,
        igv,
        total: expense.total,
        paymentMethod: expense.paymentMethod ?? 'TRANSFERENCIA',
        status: expense.status ?? 'REGISTRADO',
      },
    });
    expenseCount += 1;
  }

  console.log(`  ├─ Ingresos ejemplo: ${incomeCount}`);
  console.log(`  └─ Egresos ejemplo: ${expenseCount}`);
}

async function main() {
  console.log('🌱 Restaurando catálogos base…');
  await seedObras();
  await seedMaterials();
  await seedProveedores();
  await seedExpenseCategories();

  console.log('🌱 Generando ejemplos de ingresos/egresos…');
  await seedAdminSamples();

  console.log('✅ Seed completado.');
}

main()
  .catch((error) => {
    console.error('❌ Error durante el seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

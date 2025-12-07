# Plantillas de cotización

Coloca tus datos en estos archivos antes de importarlos al sistema. Ambos usan el mismo formato para que el emparejamiento sea automático.

## plantilla-base.xlsx
- Usar para la propuesta oficial o expediente técnico.
- Columnas obligatorias (sin celdas combinadas):
  1. `ITEM`
  2. `DESCRIPCION DE PARTIDAS`
  3. `UND`
  4. `METRADO CANTIDAD`
  5. `COSTO UNITARIO`
  6. `COSTO TOTAL`
- Puedes agregar subtítulos (por ejemplo, "LINEAS PRIMARIAS"), dejando vacías las columnas numéricas en esa fila.
- Cada hoja (LP, RP, RS, SFTV) puede tener sus propios ítems.

## plantilla-cotizacion.xlsx
- Comparte este archivo con cada proveedor para que llene su propuesta.
- Mantén los mismos encabezados; sólo modifica los valores de cantidad, costo unitario y costo total.
- Si un proveedor no cotiza un ítem, déjalo vacío o coloca `0` en las columnas numéricas.

> Tip: si necesitas conservar tu formato original, copia y pega únicamente los valores (sin fórmulas) dentro de estas plantillas antes de importarlos.

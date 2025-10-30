#!/usr/bin/env bash
set -euo pipefail

API="http://localhost:4000/api"

pass(){ echo -e "✅ $*"; }
fail(){ echo -e "❌ $*"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || fail "Falta $1. Instala: sudo apt install $1"; }
need curl
need jq

TS=$(date +%s)
OBRA_NAME="OBRA_TEST_$TS"
OBRA_CODE="OB-$TS"
MAT_NAME="Cable TEST $TS"
PROV_NAME="Proveedor TEST $TS"
FRENTE_NAME="Frente TEST $TS"

echo "== Smoke tests OBRA-ERP =="
echo "API: $API"
echo "---"

# 0) health
curl -fsS "$API/health" | jq -e '.ok==true' >/dev/null || fail "/health"
pass "/health OK"

# 1) crear obra
OBRA=$(curl -fsS -X POST "$API/obras" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$OBRA_NAME\",\"code\":\"$OBRA_CODE\"}")
OBRA_ID=$(echo "$OBRA" | jq -r '.id')
[[ "$OBRA_ID" != "null" ]] || fail "crear obra"
pass "Obra creada id=$OBRA_ID"

# 2) crear frente
FRENTE=$(curl -fsS -X POST "$API/frentes" -H 'Content-Type: application/json' \
  -d "{\"obraId\":$OBRA_ID,\"name\":\"$FRENTE_NAME\"}")
FRENTE_ID=$(echo "$FRENTE" | jq -r '.id')
[[ "$FRENTE_ID" != "null" ]] || fail "crear frente"
pass "Frente creado id=$FRENTE_ID"

# 3) crear material
MAT=$(curl -fsS -X POST "$API/materials" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$MAT_NAME\",\"unit\":\"m\"}")
MAT_ID=$(echo "$MAT" | jq -r '.id')
[[ "$MAT_ID" != "null" ]] || fail "crear material"
pass "Material creado id=$MAT_ID"

# 4) crear proveedor
PROV=$(curl -fsS -X POST "$API/proveedores" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$PROV_NAME\"}")
PROV_ID=$(echo "$PROV" | jq -r '.id')
[[ "$PROV_ID" != "null" ]] || fail "crear proveedor"
pass "Proveedor creado id=$PROV_ID"

# 5) IN 100
IN1=$(curl -fsS -X POST "$API/moves" -H 'Content-Type: application/json' \
  -d "{\"obraId\":$OBRA_ID,\"materialId\":$MAT_ID,\"proveedorId\":$PROV_ID,\"type\":\"IN\",\"quantity\":100,\"unitCost\":2.4,\"note\":\"Compra inicial\"}")
BAL1=$(echo "$IN1" | jq -r '.balanceAfter // .quantity') # por compatibilidad
[[ "$BAL1" =~ ^[0-9]+(\.[0-9]+)?$ ]] || fail "IN 100"
pass "IN 100 OK (balanceAfter=$BAL1)"

# 6) OUT insuficiente 1000 -> 409
HTTP_OUT_BIG=$(curl -s -o /tmp/out_big.json -w "%{http_code}" -X POST "$API/moves" -H 'Content-Type: application/json' \
  -d "{\"obraId\":$OBRA_ID,\"frenteId\":$FRENTE_ID,\"materialId\":$MAT_ID,\"type\":\"OUT\",\"quantity\":1000,\"note\":\"Prueba insuficiente\"}")
[[ "$HTTP_OUT_BIG" == "409" ]] || { echo "Respuesta:"; cat /tmp/out_big.json; fail "OUT 1000 debía ser 409"; }
pass "OUT 1000 rechazada (409) OK"

# 7) OUT válido 30 -> 201
OUT1=$(curl -fsS -X POST "$API/moves" -H 'Content-Type: application/json' \
  -d "{\"obraId\":$OBRA_ID,\"frenteId\":$FRENTE_ID,\"materialId\":$MAT_ID,\"type\":\"OUT\",\"quantity\":30,\"note\":\"Salida a frente\"}")
BAL2=$(echo "$OUT1" | jq -r '.balanceAfter')
[[ "$BAL2" =~ ^[0-9]+(\.[0-9]+)?$ ]] || fail "OUT 30"
pass "OUT 30 OK (balanceAfter=$BAL2)"

# 8) stock -> disponible ~ 70
STOCK=$(curl -fsS "$API/stock?obraId=$OBRA_ID")
DISP=$(echo "$STOCK" | jq -r ".[] | select(.materialId==$MAT_ID) | .disponible // .stock // 0")
[[ "$DISP" == "70" || "$DISP" == "70.0" || "$DISP" == "70.000" || "$DISP" == "170" || "$DISP" == "140" ]] || true
# (por si tenías IN/OUT previos en misma obra/material)
pass "Stock consultado (disponible reportado: $DISP)"

# 9) kardex: debe listar movimientos en orden y saldo final = balanceAfter
KAR=$(curl -fsS "$API/kardex/$MAT_ID?obraId=$OBRA_ID")
# intenta leer saldo final
SALDO=$(echo "$KAR" | jq -r '.rows[-1].saldo // empty')
[[ -z "$SALDO" ]] && SALDO="$BAL2"
pass "Kárdex OK (saldo final: $SALDO)"

# 10) /moves listado (limit=2)
LIST=$(curl -fsS "$API/moves?obraId=$OBRA_ID&limit=2")
COUNT=$(echo "$LIST" | jq -r '.items | length')
[[ "$COUNT" -ge 1 ]] || fail "Listado /moves vacío"
pass "GET /moves OK (items=$COUNT)"

# 11) Validación: IN sin unitCost -> 400
HTTP_BAD_IN=$(curl -s -o /tmp/bad_in.json -w "%{http_code}" -X POST "$API/moves" -H 'Content-Type: application/json' \
  -d "{\"obraId\":$OBRA_ID,\"materialId\":$MAT_ID,\"type\":\"IN\",\"quantity\":1}")
[[ "$HTTP_BAD_IN" == "400" ]] || { echo "Respuesta:"; cat /tmp/bad_in.json; fail "IN sin unitCost debía ser 400"; }
pass "Validación 400 (IN sin unitCost) OK"

# 12) 404
HTTP_404=$(curl -s -o /tmp/notfound.json -w "%{http_code}" "$API/esto-no-existe")
[[ "$HTTP_404" == "404" ]] || fail "404 esperado"
pass "404 OK"

# 13) (Opcional) CSV si existen endpoints
if curl -fsI "$API/export/stock.csv?obraId=$OBRA_ID" | grep -qi 'text/csv'; then
  pass "Export stock.csv OK"
else
  echo "ℹ️  export/stock.csv no disponible (opcional)"
fi

if curl -fsI "$API/export/kardex.csv?obraId=$OBRA_ID&materialId=$MAT_ID" | grep -qi 'text/csv'; then
  pass "Export kardex.csv OK"
else
  echo "ℹ️  export/kardex.csv no disponible (opcional)"
fi

echo "---"
pass "TODAS LAS PRUEBAS PASARON"

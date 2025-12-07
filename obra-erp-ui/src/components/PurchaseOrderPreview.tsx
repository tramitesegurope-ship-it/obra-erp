import { type FC, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  PurchaseOrderFormData,
  PurchaseOrderPreviewItem,
  PurchaseOrderSignatureImage,
} from '../lib/types';

const currencySymbols: Record<string, string> = {
  PEN: 'S/',
  USD: '$',
  EUR: '€',
};

const formatNumber = (value: number) =>
  value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPercentCompact = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  const scaled = value * 100;
  if (!Number.isFinite(scaled)) return '0%';
  if (Number.isInteger(scaled)) return `${scaled.toFixed(0)}%`;
  return `${scaled.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
};

const extractDateParts = (isoDate?: string) => {
  const buildParts = (date: Date) => ({
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  });

  if (!isoDate) {
    const now = new Date();
    return buildParts(now);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return buildParts(date);
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return { day: '--', month: '--', year: '----' };
  }
  return buildParts(parsed);
};

const ConsorcioLogo: FC = () => (
  <svg className="po-logo" viewBox="0 0 120 120" role="img" aria-label="Consorcio Pacífico">
    <defs>
      <radialGradient id="po-logo-grad" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#7dd3fc" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </radialGradient>
    </defs>
    <circle cx="60" cy="60" r="55" fill="url(#po-logo-grad)" />
    <path
      d="M12 70c15-4 32-10 48-8s32 12 48 12"
      stroke="#fef3c7"
      strokeWidth="6"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M10 78c18-2 32-10 50-6s30 10 50 8"
      stroke="#fff"
      strokeWidth="4"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
);

type PurchaseOrderPreviewProps = {
  form: PurchaseOrderFormData;
  supplierName: string;
  items: PurchaseOrderPreviewItem[];
  currency: string;
  igvRate: number;
  totals: {
    subtotal: number;
    discount: number;
    discountRate: number;
    netSubtotal: number;
    igv: number;
    total: number;
  };
  logoSrc?: string | null;
  signatureImages?: PurchaseOrderSignatureImage[];
  onSignaturePositionChange?: (signatureId: string, offset: { x: number; y: number }) => void;
};

const PurchaseOrderPreview: FC<PurchaseOrderPreviewProps> = ({
  form,
  supplierName,
  items,
  currency,
  igvRate,
  totals,
  logoSrc,
  signatureImages,
  onSignaturePositionChange,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const dateParts = extractDateParts(form.issueDate);
  const currencyLabel = currencySymbols[currency?.toUpperCase()] ?? currency;
  const hasItems = items.length > 0;
  const list = hasItems
    ? items
    : [{ id: 'placeholder', description: '—', quantity: 0, unit: '', unitPrice: 0 }];
  const signatureName = form.signatureName || 'JAIME SALAZAR ESPINOZA';
  const signatureTitle = form.signatureTitle || 'GERENTE ADMINISTRATIVO';
  const manualSignatureVisible = form.showManualSignature !== false;

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const handleSignaturePointerDown = (
    signatureId: string,
  ) => (event: ReactPointerEvent<HTMLImageElement>) => {
    if (!onSignaturePositionChange) return;
    const stage = stageRef.current;
    const image = event.currentTarget;
    if (!stage || !image) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const pointerOffsetX = event.clientX - (imageRect.left + imageRect.width / 2);
    const pointerOffsetY = event.clientY - (imageRect.top + imageRect.height / 2);
    const maxOffsetX = Math.max(0, stageRect.width / 2 - imageRect.width / 2);
    const maxOffsetY = Math.max(0, stageRect.height / 2 - imageRect.height / 2);

    const computePosition = (clientX: number, clientY: number) => {
      const relativeX = clientX - stageRect.left - stageRect.width / 2;
      const relativeY = clientY - stageRect.top - stageRect.height / 2;
      return {
        x: clamp(relativeX - pointerOffsetX, -maxOffsetX, maxOffsetX),
        y: clamp(relativeY - pointerOffsetY, -maxOffsetY, maxOffsetY),
      };
    };

    onSignaturePositionChange(signatureId, computePosition(event.clientX, event.clientY));

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      onSignaturePositionChange(signatureId, computePosition(moveEvent.clientX, moveEvent.clientY));
    };

    const stopDragging = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
  };

  const showDiscount = totals.discount > 0;
  const discountLabel = formatPercentCompact(totals.discountRate);

  return (
    <div className="purchase-order-page purchase-order-printable">
      <div className="po-header">
        <div className="po-brand">
          {logoSrc ? (
            <img src={logoSrc} alt="Logo de la empresa" className="po-logo-img" />
          ) : (
            <>
              <ConsorcioLogo />
              <div className="po-brand-text">
                <p>CONSORCIO</p>
                <p>PACÍFICO</p>
              </div>
            </>
          )}
        </div>
        <div className="po-title-block">
          <p className="po-title-main">ORDEN DE COMPRA Nº {form.orderNumber || '—'}</p>
        </div>
        <div className="po-date-box">
          <table>
            <thead>
              <tr>
                <th>DÍA</th>
                <th>MES</th>
                <th>AÑO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{dateParts.day}</td>
                <td>{dateParts.month}</td>
                <td>{dateParts.year}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="po-info">
        <p><span>SEÑOR (ES):</span> {supplierName || '—'}</p>
        <p><span>ATENCIÓN:</span> {form.attention || '—'}</p>
        <p><span>MOTIVO:</span> {form.motive || '—'}</p>
        <p><span>LO SIGUIENTE:</span> {form.scope || '—'}</p>
      </div>

      <div className="po-invoice">
        <p><span>FACTURA A NOMBRE DE:</span> {form.invoiceName || '—'}</p>
        <p><span>DIRECCIÓN:</span> {form.invoiceAddress || '—'}</p>
        <p><span>RUC:</span> {form.invoiceRuc || '—'}</p>
      </div>

      <div className="po-table-wrap">
        <table className="po-table">
          <thead>
            <tr>
              <th colSpan={5}>ARTÍCULOS</th>
              <th colSpan={2}>VALOR</th>
            </tr>
            <tr>
              <th className="po-cell-center">ITEM</th>
              <th className="po-cell-center">CANT.</th>
              <th className="po-cell-center">UND.</th>
              <th colSpan={2}>DESCRIPCIÓN / METRADO</th>
              <th className="po-price">PRECIO UNITARIO {currencyLabel}</th>
              <th className="po-price">PRECIO PARCIAL {currencyLabel}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item, index) => {
              const codeLabel = formatItemCode(item.itemCode);
              const lineTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
              return (
                <tr key={item.id}>
                  <td className="po-cell-center">{index + 1}</td>
                  <td className="po-cell-center">{formatNumber(Number(item.quantity) || 0)}</td>
                  <td className="po-cell-center">{item.unit || '—'}</td>
                  <td colSpan={2}>
                    <div className="po-desc-block">
                      {codeLabel && <span className="po-desc-code">{codeLabel}</span>}
                      <div className="po-desc-texts">
                        <span className="po-desc-main">{item.description}</span>
                        {item.providerDescription && (
                          <span className="po-desc-provider">
                            {item.providerDescription}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="po-price">{formatNumber(Number(item.unitPrice) || 0)}</td>
                  <td className="po-price">{formatNumber(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="po-totals">
        <div className="po-totals-row">
          <div className="po-totals-cell">
            <span>TOTAL COSTO DIRECTO</span>
            <strong>{currencyLabel} {formatNumber(totals.subtotal || 0)}</strong>
          </div>
          {showDiscount ? (
            <>
              <div className="po-totals-cell">
                <span>DESCUENTO ({discountLabel})</span>
                <strong>- {currencyLabel} {formatNumber(totals.discount)}</strong>
              </div>
              <div className="po-totals-cell">
                <span>SUBTOTAL NETO</span>
                <strong>{currencyLabel} {formatNumber(totals.netSubtotal)}</strong>
              </div>
            </>
          ) : null}
        </div>
        <div className="po-totals-row">
          <div className="po-totals-cell">
            <span>IGV ({(igvRate * 100).toFixed(2)}%)</span>
            <strong>{currencyLabel} {formatNumber(totals.igv || 0)}</strong>
          </div>
          <div className="po-totals-cell">
            <span>COSTO TOTAL {currency}</span>
            <strong>{currencyLabel} {formatNumber(totals.total || 0)}</strong>
          </div>
        </div>
      </div>

      <div className="po-signatures">
        <div className="po-signature-block">
          <div
            ref={stageRef}
            className={`po-signature-stage${
              signatureImages?.length && onSignaturePositionChange ? ' po-signature-stage-draggable' : ''
            }${manualSignatureVisible ? '' : ' po-signature-stage-minimal'}`}
          >
            {signatureImages?.map(image => (
              <img
                key={image.id}
                src={image.src}
                alt="Firma"
                className="po-signature-img"
                style={{
                  transform: `translate(calc(-50% + ${image.offsetX ?? 0}px), calc(-50% + ${image.offsetY ?? 0}px))`,
                }}
                draggable={false}
                onPointerDown={handleSignaturePointerDown(image.id)}
              />
            ))}
            {manualSignatureVisible && <div className="po-signature-guide" />}
          </div>
          {manualSignatureVisible && (
            <>
              <p className="po-signature-name">{signatureName}</p>
              <p className="po-signature-title">{signatureTitle}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderPreview;
const formatItemCode = (code?: string | number | null) => {
  if (code === null || code === undefined) return null;
  const raw = String(code).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) {
    return Number(numeric.toFixed(2)).toString();
  }
  return raw;
};

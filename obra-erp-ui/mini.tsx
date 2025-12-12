function Foo() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Administración de Personal</h1>
          <p className="text-sm text-slate-500">Control de asistencia, planillas y boletas para Consorcio Pacífico.</p>
        </div>
        <div className="flex gap-2">
          {(['employees', 'attendance', 'payroll'] as TabKey[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md border px-3 py-1 text-sm font-medium ${
                tab === key ? 'border-blue-500 bg-blue-100 text-blue-700' : 'border-slate-300 text-slate-600'
              }`}
            >
              {key === 'employees' && 'Personal'}
              {key === 'attendance' && 'Asistencia'}
              {key === 'payroll' && 'Planillas'}
            </button>
          ))}
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-slate-600">
          Obra
          <div className="mt-1">
            <SearchableSelect<number>
              value={typeof obraId === 'number' ? obraId : ''}
              options={obras.map((obra) => ({ value: obra.id, label: obra.name }))}
              onChange={(selected, input) => {
                if (selected !== null) {
                  setObraId(selected);
                } else if (!input.trim()) {
                  setObraId('');
                }
              }}
              placeholder="Todas las obras"
            />
          </div>
        </label>
      </section>

      {tab === 'employees' && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-700">Registrar trabajador</h2>
            {employeeAlert && (
              <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {employeeAlert}
              </p>
            )}
            <form className="flex flex-col gap-3" onSubmit={handleCreateEmployee}>
              <div className="flex gap-3">
                <input
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Nombres"
                  value={employeeForm.firstName}
                  onChange={event => handleEmployeeFormChange('firstName', event.target.value)}
                  required
                />
                <input
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Apellidos"
                  value={employeeForm.lastName}
                  onChange={event => handleEmployeeFormChange('lastName', event.target.value)}
                  required
                />
              </div>
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Documento (DNI)"
                value={employeeForm.documentNumber}
                onChange={event => handleEmployeeFormChange('documentNumber', event.target.value)}
              />
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Cargo"
                value={employeeForm.position}
                onChange={event => handleEmployeeFormChange('position', event.target.value)}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Sueldo base (PEN)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={employeeForm.baseSalary}
                    onChange={event => handleEmployeeFormChange('baseSalary', event.target.value)}
                    required
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Sistema pensionario
                  <SearchableSelect<string>
                    value={employeeForm.pensionSystem}
                    options={PENSION_SYSTEM_OPTIONS}
                    onChange={(selected, input) => {
                      if (selected) handleEmployeeFormChange('pensionSystem', selected);
                      else if (!input.trim()) handleEmployeeFormChange('pensionSystem', '');
                    }}
                    placeholder="Selecciona o escribe el sistema"
                  />
                </label>
              </div>
              <label className="text-sm text-slate-600">
                Área del trabajador
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={employeeForm.area}
                  onChange={event => handleEmployeeFormChange('area', event.target.value as EmployeeArea)}
                >
                  {EMPLOYEE_AREA_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Banco
                  <select
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={employeeForm.bankType}
                    onChange={event => handleEmployeeFormChange('bankType', event.target.value as BankTypeOption)}
                  >
                    {BANK_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Número de cuenta
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Cuenta bancaria"
                    value={employeeForm.accountNumber}
                    onChange={event => handleEmployeeFormChange('accountNumber', event.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  CCI
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Código CCI"
                    value={employeeForm.cci}
                    onChange={event => handleEmployeeFormChange('cci', event.target.value)}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Celular
                  <input
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Número de celular"
                    value={employeeForm.phone}
                    onChange={event => handleEmployeeFormChange('phone', event.target.value)}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-600">
                Fecha de ingreso
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={employeeForm.startDate}
                  onChange={event => handleEmployeeFormChange('startDate', event.target.value)}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  % Pensión
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={employeeForm.pensionRate}
                    onChange={event => handleEmployeeFormChange('pensionRate', event.target.value)}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  % Essalud
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={employeeForm.healthRate}
                    onChange={event => handleEmployeeFormChange('healthRate', event.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500"
                  checked={employeeForm.absenceSundayPenalty}
                  onChange={event => handleEmployeeFormChange('absenceSundayPenalty', event.target.checked)}
                />
                <span>
                  Descontar domingos cuando exista falta
                  <span className="mt-1 block text-xs text-slate-500">
                    Si falta uno o más días en la semana se descuenta también el domingo de esa semana.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {typeof selectedEmployeeId === 'number' ? 'Actualizar trabajador' : 'Guardar trabajador'}
                </button>
                <div className="min-w-[220px]">
                  <SearchableSelect<string>
                    value={selectedEmployeeId === '' ? '' : String(selectedEmployeeId)}
                    options={employees.map((emp) => ({
                      value: String(emp.id),
                      label: employeeName(emp),
                    }))}
                    onChange={(selected, input) => {
                      if (selected !== null) {
                        const id = Number(selected);
                        setSelectedEmployeeId(id);
                        handleEditEmployee(id);
                      } else if (!input.trim()) {
                        setSelectedEmployeeId('');
                        setEmployeeForm(defaultEmployeeForm());
                      }
                    }}
                    placeholder="Selecciona trabajador"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
                    onClick={() => {
                      setEmployeeForm(defaultEmployeeForm());
                      setSelectedEmployeeId('');
                      setEmployeeAlert(null);
                    }}
                  >
                    Nuevo
                  </button>
                  <button
                    type="button"
                    className={`rounded px-3 py-2 text-sm font-semibold text-white ${deleteUnlocked ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-300 cursor-not-allowed'}`}
                    onClick={() => handleDeleteEmployee()}
                    disabled={typeof selectedEmployeeId !== 'number' || !deleteUnlocked}
                    title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-700">Equipo en obra</h2>
              {employeesLoading && <span className="text-xs text-slate-400">Cargando…</span>}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>Filtrar por área:</span>
              {AREA_FILTER_BUTTONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleEmployeeAreaFilterChange(option.value)}
                  className={`rounded-full border px-3 py-1 font-semibold ${
                    employeeAreaFilter === option.value
                      ? 'border-blue-500 bg-blue-100 text-blue-700'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Trabajador</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Cargo</th>
                     <th className="px-3 py-2">Área</th>
                    <th className="px-3 py-2">Ingreso</th>
                    <th className="px-3 py-2 text-right">Sueldo</th>
                    <th className="px-3 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(employee => (
                    <tr
                      key={employee.id}
                      className="border-b border-slate-100"
                      onClick={() => handleEditEmployee(employee.id)}
                      style={{
                        backgroundColor:
                          selectedEmployeeId === employee.id
                            ? 'rgba(191, 219, 254, 0.4)'
                            : undefined,
                        cursor: 'pointer',
                      }}
                    >
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {employeeName(employee)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {employee.documentNumber ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {employee.position ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {employee.area ? EMPLOYEE_AREA_LABELS[employee.area] : EMPLOYEE_AREA_LABELS.OPERATIVE}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatIsoDate(employee.startDate ?? null)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {currency(employee.baseSalary)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleEmployeeActive(employee)}
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            employee.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {employee.isActive ? 'Activo' : 'Baja'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredEmployees.length && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay trabajadores registrados para esta obra.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-700">Registrar asistencia</h2>
            {attendanceAlert && (
              <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {attendanceAlert}
              </p>
            )}
            <form className="flex flex-col gap-3" onSubmit={handleSaveAttendance}>
              <label className="text-sm text-slate-600">
                Trabajador
                <SearchableSelect<string>
                  value={attendanceForm.employeeId}
                  options={employees.map(emp => ({ value: String(emp.id), label: employeeName(emp) }))}
                  onChange={(selected, input) => {
                    if (selected) handleAttendanceFormChange('employeeId', selected);
                    else if (!input.trim()) handleAttendanceFormChange('employeeId', '');
                  }}
                  placeholder="Selecciona o escribe el trabajador"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-600">
                  Fecha
                  <input
                    type="date"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={attendanceForm.date}
                    onChange={event => handleAttendanceFormChange('date', event.target.value)}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Estado
                  <SearchableSelect<AttendanceStatus>
                    value={attendanceForm.status}
                    options={ATTENDANCE_STATUS_OPTIONS}
                    onChange={(selected, input) => {
                      if (selected) handleAttendanceFormChange('status', selected);
                      else if (!input.trim()) handleAttendanceFormChange('status', 'PRESENT');
                    }}
                    placeholder="Selecciona el estado"
                  />
                </label>
              </div>
              <label className="text-sm text-slate-600">
                Feriados trabajados en el mes
                <input
                  type="number"
                  min="0"
                  max="10"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={attendanceForm.holidayCount}
                  onChange={(event) =>
                    handleAttendanceFormChange('holidayCount', event.target.value)
                  }
                />
                <span className="mt-1 block text-xs text-slate-400">
                  Ingresa cuántos feriados trabajó la persona en el mes para calcular el bono.
                </span>
              </label>
              {attendanceForm.status === 'TARDY' && (
                <label className="text-sm text-slate-600">
                  Minutos de tardanza
                  <input
                    type="number"
                    min="0"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={attendanceForm.minutesLate}
                    onChange={event => handleAttendanceFormChange('minutesLate', event.target.value)}
                  />
                </label>
              )}
              {attendanceForm.status === 'PERMISSION' && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-600">
                    Horas sin goce
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={attendanceForm.permissionHours}
                      onChange={event => handleAttendanceFormChange('permissionHours', event.target.value)}
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Condición
                    <SearchableSelect<'paid' | 'unpaid'>
                      value={attendanceForm.permissionPaid}
                      options={YES_NO_OPTIONS}
                      onChange={(selected, input) => {
                        if (selected) handleAttendanceFormChange('permissionPaid', selected);
                        else if (!input.trim()) handleAttendanceFormChange('permissionPaid', 'unpaid');
                      }}
                      placeholder="Con o sin goce"
                    />
                  </label>
                </div>
              )}
              <label className="text-sm text-slate-600">
                Horas extras
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={attendanceForm.extraHours}
                  onChange={event => handleAttendanceFormChange('extraHours', event.target.value)}
                />
              </label>
              <textarea
                className="min-h-[80px] rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Observaciones"
                value={attendanceForm.notes}
                onChange={event => handleAttendanceFormChange('notes', event.target.value)}
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Guardar asistencia
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-700">Historial de asistencia</h2>
                <p className="text-xs text-slate-500">
                  Rango: {attendanceRange.label}
                  {attendanceFilterEmployee && ` · Trabajador: ${employeeName(attendanceFilterEmployee)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                  value={attendanceMonth}
                  onChange={event => setAttendanceMonth(event.target.value)}
                />
                <SearchableSelect<number>
                  value={attendanceEmployeeFilter}
                  options={employees.map(employee => ({
                    value: employee.id,
                    label: employeeName(employee),
                  }))}
                  onChange={(selected, input) => {
                    if (selected !== null) {
                      setAttendanceEmployeeFilter(selected);
                      refreshAttendance(obraId, selected);
                    } else if (!input.trim()) {
                      setAttendanceEmployeeFilter('');
                      refreshAttendance(obraId, null);
                    }
                  }}
                  placeholder="Todos los trabajadores"
                />
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                  onClick={() => refreshAttendance(obraId)}
                >
                  Actualizar
                </button>
              </div>
            </div>
            {attendanceLoading && <p className="text-xs text-slate-400">Cargando asistencias…</p>}
            <div className="max-h-[420px] overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Trabajador</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Detalle</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map(record => (
                    <tr key={record.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-600">
                        {record.date.slice(0, 10).split('-').reverse().join('/')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {employeeName(record.employee as Employee)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {prettyStatus(record.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {record.status === 'TARDY' && (
                          <div>Tardanza {record.minutesLate ?? 0} min</div>
                        )}
                        {record.status === 'PERMISSION' && (
                          <div>
                            {record.permissionPaid === false
                              ? `Permiso sin goce ${record.permissionHours ?? 0} h`
                              : 'Permiso con goce'}
                          </div>
                        )}
                        {record.status === 'PRESENT' && (
                          <div>{record.extraHours ? `Extras ${record.extraHours} h` : '—'}</div>
                        )}
                        {record.status === 'ABSENT' && (
                          <div>{record.notes ?? 'Falta'}</div>
                        )}
                        {(() => {
                          const holidayCount =
                            record.holidayCount ??
                            (record.holidayWorked ? 1 : 0);
                          if (holidayCount > 0) {
                            return (
                              <div className="text-blue-600">
                                Feriados trabajados: {holidayCount}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className={`text-xs font-semibold ${deleteUnlocked ? 'text-rose-600 hover:underline' : 'text-slate-400 cursor-not-allowed opacity-60'}`}
                          onClick={() => handleDeleteAttendance(record)}
                          disabled={!deleteUnlocked}
                          title={deleteUnlocked ? 'Eliminar' : 'Desbloquea en Seguridad para eliminar'}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!attendance.length && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                        No hay registros de asistencia en el rango seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="grid gap-6 lg:grid-cols-[360px,minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-wide text-slate-400">Resumen rápido</p>
                <h2 className="text-2xl font-semibold text-slate-900">Pagos acumulados</h2>
                <p className="text-sm text-slate-500">
                  {accumulationSummary.months.length
                    ? accumulationSummary.months.map(month => month.label).join(', ')
                    : 'Selecciona periodos para ver los totales.'}
                </p>
              </div>
              {accumulationSummary.ready && summaryCardMonths.length ? (
                <>
                  <div className="mt-6 overflow-x-auto">
                    <div className="flex min-w-max gap-4">
                      {summaryCardMonths.map(month => {
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
                        ].filter((item): item is SummaryDetailItem => item !== null);
                        const coverage =
                          month.totalToPay > 0 ? Math.min(month.disbursed / month.totalToPay, 1) : 0;
                        return (
                          <article
                            key={`summary-month-${month.id}`}
                            className="group relative flex min-w-[280px] flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm shadow-sm shadow-slate-100 ring-1 ring-transparent transition duration-200 hover:-translate-y-1 hover:ring-blue-100"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  {month.label}
                                </p>
                                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Total desembolsado
                                </p>
                                <p className="text-2xl font-semibold text-slate-900">
                                  {currency(month.disbursed)}
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                                {currency(month.totalToPay)}
                              </span>
                            </div>
                            <div className="mt-4 h-1.5 w-full rounded-full bg-slate-100">
                              <span
                                className="block h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600"
                                style={{ width: `${Math.max(coverage * 100, coverage > 0 ? 8 : 0)}%` }}
                              />
                            </div>
                            <dl className="mt-4 grid gap-2 text-slate-600">
                              <div className="flex items-center justify-between gap-2">
                                <dt className="text-xs uppercase tracking-wide text-slate-400">Pendiente</dt>
                                <dd className="text-base font-semibold text-amber-600">{currency(month.pending)}</dd>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <dt className="text-xs uppercase tracking-wide text-slate-400">Total a desembolsar</dt>
                                <dd className="text-base font-semibold text-slate-900">{currency(month.totalToPay)}</dd>
                              </div>
                            </dl>
                            {detailItems.length ? (
                              <div className="mt-4 space-y-2">
                                {detailItems.map(item => (
                                  <div
                                    key={`${month.id}-${item.key}`}
                                    className="rounded-2xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-slate-500">{item.label}</span>
                                      <span className="text-slate-900">{currency(item.value)}</span>
                                    </div>
                                    {item.parts?.length ? (
                                      <p className="mt-1 text-[10px] text-slate-500">
                                        {item.parts.map((part, idx) => (
                                          <span key={part.key}>
                                            <span className="font-semibold text-slate-600">{part.label}</span>{' '}
                                            {currency(part.value)}
                                            {idx === item.parts!.length - 1 ? '' : ' · '}
                                          </span>
                                        ))}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                    </div>
                  </div>
                  </div>
                  <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr),minmax(0,1fr)]">
                    <article className="flex flex-col justify-between rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm shadow-md shadow-slate-100 ring-1 ring-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Acumulado general
                          </p>
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Pagos realizados y pendientes
                          </p>
                          <p className="text-2xl font-semibold text-slate-900">
                            {currency(accumulationDisbursement.totalDisbursed)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                            Pendiente
                          </p>
                          <p className="text-xl font-semibold text-amber-600">
                            {currency(accumulationDisbursement.pending)}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-4 grid gap-2 text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-xs uppercase tracking-wide text-slate-400">Total a desembolsar</dt>
                          <dd className="text-base font-semibold text-slate-900">
                            {currency(accumulationDisbursement.totalToPay)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 grid gap-2 text-[11px] text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Adelantos</span>
                          <span className="font-semibold text-slate-900">
                            {currency(accumulationDisbursement.extras.advances)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Feriados</span>
                          <span className="font-semibold text-slate-900">
                            {currency(accumulationDisbursement.extras.holidays)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Horas extra</span>
                          <span className="font-semibold text-slate-900">
                            {currency(accumulationDisbursement.extras.overtime)}
                          </span>
                        </div>
                        {accumulationDisbursement.extras.bonuses > 0 && (
                          <div className="flex items-center justify-between">
                            <span>Bonificaciones</span>
                            <span className="font-semibold text-slate-900">
                              {currency(accumulationDisbursement.extras.bonuses)}
                            </span>
                          </div>
                        )}
                        {accumulationSummary.totalDeductions > 0 && (
                          <div className="flex items-center justify-between">
                            <span>Descuentos</span>
                            <span className="font-semibold text-slate-900">
                              {currency(accumulationSummary.totalDeductions)}
                            </span>
                          </div>
                        )}
                      </div>
                    </article>
                    <article className="flex flex-col justify-between rounded-[28px] border border-slate-100 bg-white/90 p-5 text-sm shadow-md shadow-slate-100 ring-1 ring-slate-100">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Resumen general</p>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Neto acumulado (incluye pendientes)
                        </p>
                        <p className="text-2xl font-semibold text-slate-900">
                          {currency(accumulationSummary.total)}
                        </p>
                      </div>
                      <dl className="mt-4 grid gap-2 text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-xs uppercase tracking-wide text-slate-400">Pagado</dt>
                          <dd className="text-base font-semibold text-slate-900">
                            {currency(accumulationDisbursement.totalDisbursed)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-xs uppercase tracking-wide text-slate-400">Pendiente</dt>
                          <dd className="text-base font-semibold text-amber-600">
                            {currency(accumulationPaymentStats.pending)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-xs uppercase tracking-wide text-slate-400">Descuentos</dt>
                          <dd className="text-base font-semibold text-slate-900">
                            {currency(accumulationSummary.totalDeductions)}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 text-[11px] text-slate-500">
                        La brecha entre ambos totales (≈ {currency(accumulationSummary.total - accumulationDisbursement.totalDisbursed)}) corresponde a
                        los sueldos netos que aún no están marcados como pagados y los descuentos registrados, por eso el
                        <strong className="font-semibold text-slate-900"> resumen general </strong> siempre puede ser mayor que el
                        <strong className="font-semibold text-slate-900"> acumulado general</strong>.
                      </p>
                    </article>
                  </div>
                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {summaryCardAreas.map(area => {
                      const extras = area.extras;
                      const extrasTotal =
                        extras.advances + extras.holidays + extras.overtime + extras.bonuses;
                      const netPaidArea = area.data.netPaid;
                      const pendingArea = area.data.netPending;
                      const areaDisbursed = netPaidArea + extrasTotal;
                      const areaDetails: SummaryDetailItem[] = [];
                      if (extras.advances > 0)
                        areaDetails.push({ key: 'advances', label: 'Adelantos', value: extras.advances });
                      if (extras.holidays > 0)
                        areaDetails.push({ key: 'holidays', label: 'Feriados', value: extras.holidays });
                      if (extras.overtime > 0)
                        areaDetails.push({ key: 'overtime', label: 'Horas extra', value: extras.overtime });
                      if (extras.bonuses > 0)
                        areaDetails.push({ key: 'bonuses', label: 'Bonificaciones', value: extras.bonuses });
                      return (
                        <article
                          key={`summary-area-${area.key}`}
                          className="rounded-3xl border border-slate-100 bg-white/90 p-5 text-sm shadow-sm shadow-slate-100 ring-1 ring-transparent transition duration-200 hover:-translate-y-1 hover:ring-slate-200"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                {area.label}
                              </p>
                              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Total desembolsado
                              </p>
                              <p className="text-xl font-semibold text-slate-900">{currency(areaDisbursed)}</p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                                pendingArea > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              {pendingArea > 0 ? 'Pendiente' : 'Al día'}
                            </span>
                          </div>
                          <dl className="mt-4 grid gap-2 text-slate-600">
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-xs uppercase tracking-wide text-slate-400">Pendiente</dt>
                              <dd className="text-base font-semibold text-amber-600">{currency(pendingArea)}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <dt className="text-xs uppercase tracking-wide text-slate-400">Descuentos</dt>
                              <dd className="text-base font-semibold text-slate-900">
                                {currency(area.data.totalDeductions)}
                              </dd>
                            </div>
                          </dl>
                          {areaDetails.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {areaDetails.map(item => (
                                <div
                                  key={`${area.key}-${item.key}`}
                                  className="rounded-2xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-500">{item.label}</span>
                                    <span className="text-slate-900">{currency(item.value)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Agrega periodos al acumulado para ver cuánto se desembolsó cada mes.
                </p>
              )}
              <p className="mt-4 text-[11px] text-slate-500">
                Descuentos = faltas, permisos sin goce, tardanzas y sanciones registradas. No se descuenta el tiempo que
                aún no se trabaja (prorrateos por ingreso en mitad de mes).
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-700">
                {editingPeriodId ? 'Editar periodo de planilla' : 'Nuevo periodo de planilla'}
              </h2>
              {periodAlert && (
                <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {periodAlert}
                </p>
              )}
              {editingPeriodId && (
                <p className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Editando periodo {MONTH_NAMES[Math.min(Math.max(periodForm.month, 1), 12) - 1]} {periodForm.year}.{' '}
                  Ajusta los datos y guarda los cambios o cancela la edición.
                </p>
              )}
              <form className="flex flex-col gap-3" onSubmit={handleSubmitPeriod}>
                <div className="flex gap-3">
                  <label className="text-sm text-slate-600">
                    Mes
                    <SearchableSelect<number>
                      value={periodForm.month}
                      options={MONTH_SELECT_OPTIONS}
                      onChange={(selected, input) => {
                        if (selected !== null) {
                          setPeriodForm(prev => ({ ...prev, month: selected }));
                        } else if (!input.trim()) {
                          setPeriodForm(prev => ({ ...prev, month: new Date().getMonth() + 1 }));
                        }
                      }}
                      placeholder="Mes (1-12)"
                    />
                  </label>
                  <label className="text-sm text-slate-600">
                    Año
                    <input
                      type="number"
                      min="2020"
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                      value={periodForm.year}
                      onChange={event => setPeriodForm(prev => ({ ...prev, year: Number(event.target.value) }))}
                    />
                  </label>
                </div>
                <label className="text-sm text-slate-600">
                  Días laborables
                  <input
                    type="number"
                    min="20"
                    max="31"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={periodForm.workingDays}
                    onChange={event =>
                      setPeriodForm(prev => ({
                        ...prev,
                        workingDays: Number(event.target.value),
                        fixedThirtyDays: prev.fixedThirtyDays && Number(event.target.value) === 30,
                      }))
                    }
                    disabled={periodForm.fixedThirtyDays}
                  />
                </label>
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={periodForm.fixedThirtyDays}
                    onChange={event =>
                      setPeriodForm(prev => ({
                        ...prev,
                        fixedThirtyDays: event.target.checked,
                        workingDays: event.target.checked ? 30 : prev.workingDays,
                      }))
                    }
                  />
                  <span>
                    Mes contable cerrado de 30 días. Mantén activo para que todos los sueldos partan de 30 días y solo varíen por
                    faltas, permisos o bonos.
                  </span>
                </label>
                <textarea
                  className="min-h-[80px] rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Notas de la planilla (opcional)"
                  value={periodForm.notes}
                  onChange={event => setPeriodForm(prev => ({ ...prev, notes: event.target.value }))}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {editingPeriodId ? 'Guardar cambios' : 'Crear periodo'}
                  </button>
                  {editingPeriodId && (
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={handleCancelPeriodEdit}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-700">Periodos</h2>
                {periodsLoading && <span className="text-xs text-slate-400">Cargando…</span>}
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Periodo</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2 text-right">Días</th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map(period => {
                      const isEditing = editingPeriodId === period.id;
                      return (
                        <tr key={period.id} className="border-b border-slate-100">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleSelectPeriod(period.id)}
                              className={`text-left font-medium ${
                                selectedPeriodId === period.id ? 'text-blue-600' : 'text-slate-700'
                              }`}
                            >
                              {MONTH_NAMES[period.month - 1]} {period.year}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {PERIOD_STATUS_LABEL[period.status]}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {period.workingDays}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            <div className="flex justify-end gap-2">
                              {period.status !== 'CLOSED' && (
                                <button
                                  type="button"
                                  className={`rounded border border-slate-300 px-2 py-1 ${
                                    isEditing ? 'cursor-default bg-slate-100 text-slate-400' : ''
                                  }`}
                                  onClick={() => handleEditPeriod(period)}
                                  disabled={isEditing}
                                >
                                  {isEditing ? 'Editando' : 'Editar'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded border border-slate-300 px-2 py-1"
                                onClick={() => handleGeneratePeriod(period)}
                              >
                                Generar
                              </button>
                              {period.status !== 'CLOSED' && (
                                <button
                                  type="button"
                                  className="rounded border border-rose-300 px-2 py-1 text-rose-600"
                                  onClick={() => handleClosePeriod(period.id)}
                                >
                                  Cerrar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!periods.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">
                          Aún no creas periodos para esta obra.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {selectedPeriodId && periodDetails ? (
                <div className="space-y-4">
                  <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-700">
                      Boletas {MONTH_NAMES[periodDetails.month - 1]} {periodDetails.year}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {periodDetails.entries.length} colaboradores · Estado: {PERIOD_STATUS_LABEL[periodDetails.status]}
                    </p>
                  </div>
                  <div className="w-full md:w-64">
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
                      placeholder="Buscar trabajador"
                      value={periodEntrySearch}
                      onChange={event => setPeriodEntrySearch(event.target.value)}
                    />
                  </div>
                </header>

                <div className="max-h-[260px] overflow-y-auto rounded border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2">Trabajador</th>
                        <th className="px-3 py-2 text-right">Sueldo base</th>
                        <th className="px-3 py-2 text-right">Feriados</th>
                        <th className="px-3 py-2 text-right">Descuentos</th>
                        <th className="px-3 py-2 text-right">Ajustes</th>
                        <th className="px-3 py-2 text-right">Neto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPeriodEntries.map(entry => {
                        const monthlyBase = entry.details?.breakdown?.monthlyBase ?? entry.baseSalary;
                        const totalDeductions = resolveActualDeductions(entry);
                        return (
                          <tr key={entry.id} className="border-b border-slate-100">
                            <td className="px-3 py-2 text-slate-700">
                              <button
                                type="button"
                                onClick={() => setEntryForm(prev => ({ ...prev, entryId: String(entry.id) }))}
                                className={`text-left ${
                                  entryForm.entryId === String(entry.id) ? 'text-blue-600' : ''
                                }`}
                              >
                                {employeeName(entry.employee)}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {currency(monthlyBase)}
                            </td>
                            <td className="px-3 py-2 text-right text-blue-600">
                              {currency(entry.holidayBonus ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-right text-rose-600">
                              {currency(totalDeductions)}
                            </td>
                            <td className="px-3 py-2 text-right text-green-600">
                              {currency(entry.bonusesTotal)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              {currency(entry.netPay)}
                            </td>
                          </tr>
                        );
                      })}
                      {!filteredPeriodEntries.length && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                            {periodEntries.length
                              ? 'No se encontraron boletas para esa búsqueda.'
                              : 'Genera la planilla para ver las boletas.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {chosenEntry && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      <h3 className="mb-2 font-semibold text-slate-700">
                        Detalle de {employeeName(chosenEntry.employee)}
                      </h3>
                      <ul className="space-y-1">
                        <li>
                          Sueldo mensual: {currency(chosenEntrySummary?.monthlyBase ?? chosenEntry.baseSalary)} · Prorrateado:{' '}
                          {currency(chosenEntrySummary?.proratedBase ?? chosenEntry.baseSalary)}
                        </li>
                        <li>
                          Días remunerados: {chosenEntrySummary?.daysDisplay ?? '—'}
                          {chosenEntrySummary?.startDate &&
                            ` · Fecha de ingreso: ${formatIsoDate(chosenEntrySummary.startDate)}`}
                        </li>
                        <li>
                          Asistencias: {chosenEntrySummary?.workedDays ?? chosenEntry.workedDays} días / Faltas:{' '}
                          {chosenEntrySummary?.absenceDays ?? chosenEntry.absenceDays}
                          {attendancePenaltyDays > 0 && (
                            <span className="block text-xs text-slate-500">
                              {recordedAbsenceDays} faltas registradas + {attendancePenaltyDays} domingo(s) descontado(s)
                            </span>
                          )}
                        </li>
                        <li>
                          Tardanzas: {chosenEntrySummary?.tardinessMinutes ?? chosenEntry.tardinessMinutes} min / Permisos sin goce:{' '}
                          {chosenEntrySummary?.permissionDaysRecorded ?? chosenEntry.permissionDays} días (
                          {fixed2(chosenEntrySummary?.permissionHours ?? chosenEntry.permissionHours)} h)
                        </li>
                        <li>
                          Feriados trabajados: {chosenEntry.holidayDays} días · Bono: {currency(chosenEntry.holidayBonus ?? 0)}
                        </li>
                        <li>
                          Domingos trabajados:{' '}
                          {chosenEntrySummary?.weekendSundayDays ?? chosenEntry?.details?.attendance?.weekendSundayDays ?? 0} · Bono:{' '}
                          {currency(chosenEntrySummary?.weekendSundayBonus ?? 0)}
                        </li>
                        <li>Pensión: {currency(chosenEntry.pensionAmount)} · Essalud: {currency(chosenEntry.healthAmount)}</li>
                      </ul>
                      {chosenEntrySummary && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded border border-blue-200 bg-white p-2">
                            <h4 className="text-xs font-semibold uppercase text-blue-700">Haberes percibidos</h4>
                            <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      <li>Remuneración consolidada: {currency(chosenEntrySummary.remuneration)}</li>
                      <li>Horas extras: {currency(chosenEntrySummary.overtime)}</li>
                      <li>Feriados: {currency(chosenEntrySummary.feriados)}</li>
                      <li>
                        Domingos trabajados ({chosenEntrySummary.weekendSundayDays}):{' '}
                        {currency(chosenEntrySummary.weekendSundayBonus)}
                      </li>
                      <li>Bonos adicionales: {currency(chosenEntrySummary.manualBonuses)}</li>
                            </ul>
                          </div>
                          <div className="rounded border border-rose-200 bg-white p-2">
                            <h4 className="text-xs font-semibold uppercase text-rose-700">Descuentos</h4>
                            <ul className="mt-1 space-y-1 text-xs text-slate-600">
                              <li>Faltas: {currency(chosenEntrySummary.faltas)}</li>
                              {attendancePenaltyDays > 0 && (
                                <li className="text-[11px] text-slate-500">
                                  (Incluye {attendancePenaltyDays} domingo(s) adicionales por faltas)
                                </li>
                              )}
                              <li>Permisos: {currency(chosenEntrySummary.permisos)}</li>
                              <li>Adelantos: {currency(chosenEntrySummary.manualAdvances)}</li>
                              <li>Penalidades: {currency(chosenEntrySummary.manualDeductions + chosenEntrySummary.tardiness)}</li>
                            </ul>
                          </div>
                        </div>
                      )}
                      <div className="mt-3">
                        <h4 className="text-sm font-semibold text-slate-700">Ajustes</h4>
                        <ul className="mt-1 space-y-1">
                          {chosenEntry.adjustments?.map(adj => (
                            <li
                              key={adj.id}
                              className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-white px-2 py-1"
                            >
                              <div>
                                <p className="text-xs uppercase text-slate-500">{ADJUSTMENT_LABELS[adj.type]}</p>
                                <p className="text-sm text-slate-700">{adj.concept}</p>
                              </div>
                              <div className="text-right">
                                <p
                                  className={`text-sm font-semibold ${
                                    adj.type === 'BONUS' ? 'text-green-600' : 'text-rose-600'
                                  }`}
                                >
                                  {adj.type === 'BONUS' ? '+' : '-'}
                                  {currency(adj.amount)}
                                </p>
                                <button
                                  type="button"
                                  className="text-xs text-rose-600 hover:underline"
                                  onClick={() => handleDeleteAdjustment(adj)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </li>
                          ))}
                          {!chosenEntry.adjustments?.length && (
                            <li className="rounded border border-dashed border-slate-200 px-2 py-1 text-xs">
                              Sin ajustes manuales.
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-3">
                      <h3 className="mb-2 text-sm font-semibold text-slate-700">Agregar ajuste</h3>
                      <p className="mb-2 text-xs text-slate-500">
                        Selecciona “Adelanto de sueldo” para registrar adelantos y descontarlos inmediatamente del neto.
                      </p>
                      {entryAlert && (
                        <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          {entryAlert}
                        </p>
                      )}
                      <form className="flex flex-col gap-2" onSubmit={handleAddAdjustment}>
                        <SearchableSelect<PayrollAdjustmentType>
                          value={entryForm.type}
                          options={ADJUSTMENT_SELECT_OPTIONS}
                          onChange={(selected, input) => {
                            if (selected) handleAdjustmentFormChange('type', selected);
                            else if (!input.trim()) handleAdjustmentFormChange('type', 'BONUS');
                          }}
                          placeholder="Tipo de ajuste (bono, descuento o adelanto)"
                        />
                        <input
                          className="rounded border border-slate-300 px-2 py-1 text-sm"
                          placeholder={entryForm.type === 'ADVANCE' ? 'Adelanto de sueldo' : 'Concepto'}
                          value={entryForm.concept}
                          onChange={event => handleAdjustmentFormChange('concept', event.target.value)}
                          required
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="rounded border border-slate-300 px-2 py-1 text-sm"
                          placeholder="Monto"
                          value={entryForm.amount}
                          onChange={event => handleAdjustmentFormChange('amount', event.target.value)}
                          required
                        />
                        <button
                          type="submit"
                          className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          Guardar ajuste
                        </button>
                      </form>
                      {chosenEntry && periodDetails && (
                        <button
                          type="button"
                          className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                          onClick={() => handlePrintBoleta(chosenEntry, periodDetails)}
                        >
                          Imprimir boleta
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {periodDetails && periodTotals && periodEntries.length > 0 && (
                  <div className="rounded border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-700">
                          Resumen mensual {MONTH_NAMES[periodDetails.month - 1]} {periodDetails.year}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {periodDetails.entries.length} boleta{periodDetails.entries.length === 1 ? '' : 's'} · Estado:{' '}
                          {PERIOD_STATUS_LABEL[periodDetails.status]}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase text-slate-500">Total neto a pagar</p>
                        <p className="text-2xl font-semibold text-slate-800">{currency(periodTotals.net)}</p>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                      {periodSummaryStats.map(stat => (
                        <div key={stat.key}>
                          <dt className="text-xs uppercase text-slate-500">{stat.label}</dt>
                          <dd className="text-lg font-semibold text-slate-700">{currency(stat.value)}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-slate-500">
                        Usa esta suma para estimar el pago total del mes. Puedes imprimir todas las boletas en un solo PDF.
                      </p>
                      <button
                        type="button"
                        className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
                        onClick={handlePrintAllBoletas}
                      >
                        Generar planillas del mes
                      </button>
                    </div>
                  </div>
                )}

                {periodDetails && (
                  <div className="rounded border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-700">Reporte detallado por área</h3>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-3 py-1 text-xs"
                        onClick={() => setShowAreaReport(prev => !prev)}
                      >
                        {showAreaReport ? 'Ocultar' : 'Ver reporte'}
                      </button>
                    </div>
                    {showAreaReport && (
                      <>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          {AREA_FILTER_BUTTONS.map(option => (
                            <button
                              key={`report-${option.value}`}
                              type="button"
                              onClick={() => setReportAreaFilter(option.value)}
                              className={`rounded-full border px-3 py-1 font-semibold ${
                                reportAreaFilter === option.value
                                  ? 'border-blue-500 bg-blue-100 text-blue-700'
                                  : 'border-slate-300 text-slate-600'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                          {accumulationSummary.months.length > 0 && (
                            <span className="ml-auto rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600">
                              {accumulationSummary.ready
                                ? `Acumulado (${accumulationSummary.months.length ? accumulationSummary.months.map(month => month.label).join(', ') : 'Sin periodos seleccionados'}): Neto ${currency(accumulationDisplay.total)} · Pagado ${currency(accumulationDisplay.totalPaid)} · Descuentos ${currency(accumulationDisplay.totalDeductions)}`
                                : 'Calculando acumulado…'}
                            </span>
                          )}
                        </div>
                        {accumulationOptions.length > 0 && (
                          <div className="mt-3 rounded border border-slate-200 p-3">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">Periodos para el acumulado</span>
                              <button
                                type="button"
                                className="rounded border border-blue-500 px-3 py-1 font-semibold text-blue-600 hover:bg-blue-50"
                                onClick={handleSelectLatestPeriods}
                                disabled={!sortedPeriodsDesc.length}
                              >
                                Últimos {DEFAULT_ACCUMULATION_MONTHS}
                              </button>
                              <span className="text-[11px] text-slate-500">
                                Selecciona hasta {MAX_ACCUMULATION_MONTHS} periodos.
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {accumulationOptions.map(period => {
                                const label = `${MONTH_NAMES[period.month - 1]} ${period.year}`;
                                const selected = accumulationSelection.includes(period.id);
                                return (
                                  <button
                                    key={`acc-option-${period.id}`}
                                    type="button"
                                    onClick={() => toggleAccumulationPeriod(period.id)}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                      selected
                                        ? 'border-blue-500 bg-blue-100 text-blue-700'
                                        : 'border-slate-300 text-slate-600'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {accumulationSummary.months.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-700">Estado de pago:</span>
                            {(['ALL', 'PAID', 'UNPAID'] as AccumulationFilter[]).map(option => (
                              <button
                                key={`acc-filter-${option}`}
                                type="button"
                                onClick={() => setAccumulationPaymentFilter(option)}
                                className={`rounded-full border px-3 py-1 font-semibold ${
                                  accumulationPaymentFilter === option
                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                    : 'border-slate-300 text-slate-600'
                                }`}
                              >
                                {option === 'ALL' && 'Todos'}
                                {option === 'PAID' && 'Pagados'}
                                {option === 'UNPAID' && 'Pendientes'}
                              </button>
                            ))}
                            <span className="text-[11px] text-slate-500">
                              Marca cada colaborador cuando se deposite su sueldo.
                            </span>
                            {accumulationPaymentAlert && (
                              <span className="text-[11px] font-semibold text-rose-600">
                                {accumulationPaymentAlert}
                              </span>
                            )}
                          </div>
                        )}
                        {accumulationSummary.months.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-700">Filtro por cuenta:</span>
                            {(['ALL', 'WITH', 'WITHOUT'] as const).map(option => (
                              <button
                                key={`acc-account-${option}`}
                                type="button"
                                onClick={() => setAccumulationAccountFilter(option)}
                                className={`rounded-full border px-3 py-1 font-semibold ${
                                  accumulationAccountFilter === option
                                    ? 'border-blue-500 bg-blue-100 text-blue-700'
                                    : 'border-slate-300 text-slate-600'
                                }`}
                              >
                                {option === 'ALL' && 'Todos'}
                                {option === 'WITH' && 'Con cuenta'}
                                {option === 'WITHOUT' && 'Sin cuenta'}
                              </button>
                            ))}
                            <span className="text-[11px] text-slate-500">Filtra quién ya tiene datos bancarios cargados.</span>
                          </div>
                        )}
                        {!areaReportRows.length ? (
                          <p className="mt-3 text-sm text-slate-500">
                            No hay colaboradores asignados al filtro seleccionado.
                          </p>
                        ) : (
                          (() => {
                            const areaLabel =
                              reportAreaFilter === 'ALL'
                                ? 'Todas las áreas'
                                : EMPLOYEE_AREA_LABELS[reportAreaFilter as EmployeeArea];
                            return (
                              <>
                                <div className="mt-3 overflow-x-auto">
                                  <table className="min-w-full text-xs sm:text-sm">
                                    <thead className="bg-slate-100 text-left uppercase tracking-wide text-slate-600">
                                      <tr>
                                        <th className="px-3 py-2">Trabajador</th>
                                        <th className="px-3 py-2">Sueldo mensual</th>
                                        <th className="px-3 py-2">Prorrateado</th>
                                        <th className="px-3 py-2">Días remunerados</th>
                                        <th className="px-3 py-2">Asistencias / Faltas</th>
                                        <th className="px-3 py-2">Tardanzas / Permisos</th>
                                        <th className="px-3 py-2">Feriados</th>
                                        <th className="px-3 py-2">Descuentos</th>
                                        <th className="px-3 py-2">Ajustes</th>
                                        <th className="px-3 py-2">Sueldo neto</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {areaReportRows.map(({ entry, summary }) => {
                                        const deductions = summary.actualDeductions;
                                        return (
                                          <tr key={`report-row-${entry.id}`} className="border-b border-slate-100">
                                            <td className="px-3 py-2 font-medium text-slate-700">{employeeName(entry.employee)}</td>
                                            <td className="px-3 py-2">{currency(summary.monthlyBase)}</td>
                                            <td className="px-3 py-2">{currency(summary.proratedBase)}</td>
                                            <td className="px-3 py-2">
                                              <div>{summary.daysDisplay}</div>
                                              {summary.startDate && (
                                                <div className="text-[11px] text-slate-500">
                                                  Ingreso: {formatIsoDate(summary.startDate)}
                                                </div>
                                              )}
                                            </td>
                                            <td className="px-3 py-2">
                                              {summary.workedDays} / {summary.absenceDays}
                                            </td>
                                            <td className="px-3 py-2">
                                              {summary.tardinessMinutes} min · {summary.permissionDaysRecorded}d (
                                              {fixed2(summary.permissionHours)} h)
                                            </td>
                                            <td className="px-3 py-2">
                                              {summary.holidayDays} días · {currency(summary.holidayBonus)}
                                            </td>
                                            <td className="px-3 py-2 text-rose-600">{currency(deductions)}</td>
                                            <td className="px-3 py-2 text-blue-600">{currency(entry.bonusesTotal ?? 0)}</td>
                                            <td className="px-3 py-2 font-semibold text-slate-800">{currency(entry.netPay)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-slate-300 font-semibold">
                                        <td className="px-3 py-2" colSpan={9}>
                                          Total neto del área
                                        </td>
                                        <td className="px-3 py-2 text-right">{currency(areaReportNetTotal)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-slate-700">
                                    Total neto ({areaLabel}): {currency(areaReportNetTotal)}
                                  </p>
                                  <button
                                    type="button"
                                    className="rounded border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                                    onClick={handlePrintAreaReport}
                                  >
                                    Imprimir reporte por área
                                  </button>
                                </div>
                                {accumulationSummary.months.length > 0 && (
                                  <div className="mt-6">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <h4 className="text-sm font-semibold text-slate-700">
                                        Acumulado histórico ({accumulationSummary.months.length ? accumulationSummary.months.map(month => month.label).join(', ') : 'Sin periodos seleccionados'})
                                      </h4>
                                      <div className="flex flex-wrap items-center gap-2">
                                        {(!accumulationSummary.ready || accumulationLoading) && (
                                          <span className="text-xs text-slate-500">Calculando acumulado…</span>
                                        )}
                                        <button
                                          type="button"
                                          className="rounded border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={handlePrintAccumulationReport}
                                          disabled={
                                            !accumulationSummary.ready ||
                                            !accumulationDisplay.rows.length ||
                                            accumulationLoading
                                          }
                                        >
                                          Imprimir acumulado
                                        </button>
                                      </div>
                                    </div>
                                    {accumulationSummary.ready && accumulationSummary.months.length > 0 && (
                                      <p className="mt-1 text-[11px] text-slate-500">
                                        Cada celda muestra primero el neto del mes y debajo el total pagado (neto + adelantos).
                                      </p>
                                    )}
                                    {!accumulationSummary.ready || accumulationLoading ? (
                                      <p className="mt-2 text-sm text-slate-500">
                                        Estamos trayendo las planillas de los últimos meses, espera un momento.
                                      </p>
                                    ) : !accumulationDisplay.rows.length ? (
                                      <p className="mt-2 text-sm text-slate-500">
                                        No hay montos registrados para {areaLabel} con el filtro actual.
                                      </p>
                                    ) : (
                                      <div className="mt-2 overflow-x-auto">
                                        <table className="min-w-full text-xs sm:text-sm">
                                          <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-600">
                                            <tr>
                                              <th className="px-3 py-2">Trabajador</th>
                                              {accumulationSummary.months.map(month => (
                                                <th key={`acc-month-${month.id}`} className="px-3 py-2">
                                                  {month.label}
                                                </th>
                                              ))}
                                              <th className="px-3 py-2">Acumulado</th>
                                              <th className="px-3 py-2">Pagado total</th>
                                              <th className="px-3 py-2">Descuentos</th>
                                              <th className="px-3 py-2">Banco</th>
                                              <th className="px-3 py-2">Cuenta bancaria</th>
                                              <th className="px-3 py-2">CCI</th>
                                              <th className="px-3 py-2">Yape/Plin</th>
                                              <th className="px-3 py-2">Pagado</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {accumulationDisplay.rows.map(row => (
                                              <tr key={`acc-row-${row.employeeId}`} className="border-b border-slate-100">
                                                <td className="px-3 py-2 font-medium text-slate-700">
                                                  {employeeName(row.employee)}
                                                </td>
                                                {accumulationSummary.months.map((_month, index) => {
                                                  const netValue = row.perMonth[index] ?? 0;
                                                  const paidValue = row.perMonthPaid[index] ?? netValue;
                                                  return (
                                                    <td key={`acc-cell-${row.employeeId}-${index}`} className="px-3 py-2">
                                                      <div>{currency(netValue)}</div>
                                                      <div className="text-[11px] text-slate-500">
                                                        Pagado: {currency(paidValue)}
                                                      </div>
                                                    </td>
                                                  );
                                                })}
                                                <td className="px-3 py-2 font-semibold text-slate-800">
                                                  {currency(row.total)}
                                                </td>
                                                <td className="px-3 py-2 font-semibold text-slate-800">
                                                  {currency(row.totalPaid)}
                                                </td>
                                                <td className="px-3 py-2 text-rose-600">{currency(row.totalDeductions)}</td>
                                                <td className="px-3 py-2">{row.bank || '—'}</td>
                                                <td className="px-3 py-2">{row.account || '—'}</td>
                                                <td className="px-3 py-2">{row.cci || '—'}</td>
                                                <td className="px-3 py-2">{row.yapePlin || '—'}</td>
                                                <td className="px-3 py-2">
                                                  {(() => {
                                                    const paid = Boolean(accumulationPayments[row.employeeId]);
                                                    const saving = Boolean(accumulationPaymentSaving[row.employeeId]);
                                                    const badgeClass = paid
                                                      ? 'bg-green-100 text-green-700'
                                                      : 'bg-amber-100 text-amber-700';
                                                    return (
                                                      <div className="flex flex-col gap-1 text-xs">
                                                        <span className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 font-semibold ${badgeClass}`}>
                                                          {paid ? 'Pagado' : 'Pendiente'}
                                                        </span>
                                                        {paid ? (
                                                          <button
                                                            type="button"
                                                            className="text-left font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400"
                                                            disabled={!deleteUnlocked || saving}
                                                            onClick={() => handleAccumulationPaymentChange(row.employeeId, false)}
                                                          >
                                                            {saving ? 'Actualizando…' : 'Marcar como pendiente'}
                                                          </button>
                                                        ) : (
                                                          <button
                                                            type="button"
                                                            className="text-left font-semibold text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400"
                                                            disabled={saving}
                                                            onClick={() => handleAccumulationPaymentChange(row.employeeId, true)}
                                                          >
                                                            {saving ? 'Guardando…' : 'Marcar como pagado'}
                                                          </button>
                                                        )}
                                                        {paid && !deleteUnlocked && (
                                                          <span className="text-[10px] text-slate-400">Protegido. Desbloquea Seguridad para editar.</span>
                                                        )}
                                                      </div>
                                                    );
                                                  })()}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t border-slate-200 font-semibold">
                                              <td className="px-3 py-2">Subtotal {areaLabel}</td>
                                              {accumulationDisplay.monthTotals.map((value, index) => (
                                                <td key={`acc-total-${index}`} className="px-3 py-2">
                                                  <div>{currency(value)}</div>
                                                  <div className="text-[11px] text-slate-500">
                                                    Pagado: {currency(accumulationDisplay.monthTotalsPaid[index] ?? 0)}
                                                  </div>
                                                  <div className="text-[11px] text-rose-600">
                                                    Desc.: {currency(accumulationDisplay.monthTotalsDeductions[index] ?? 0)}
                                                  </div>
                                                </td>
                                              ))}
                                              <td className="px-3 py-2">{currency(accumulationDisplay.total)}</td>
                                              <td className="px-3 py-2">{currency(accumulationDisplay.totalPaid)}</td>
                                              <td className="px-3 py-2 text-rose-600">
                                                {currency(accumulationDisplay.totalDeductions)}
                                              </td>
                                              <td className="px-3 py-2">—</td>
                                              <td className="px-3 py-2">—</td>
                                              <td className="px-3 py-2">—</td>
                                              <td className="px-3 py-2">—</td>
                                              <td className="px-3 py-2">—</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            );
                          })()
                        )}
                      </>
                    )}
                  </div>
                )}

                {periodDetails && (
                  <div className="rounded border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-700">Cuentas bancarias</h3>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-3 py-1 text-xs"
                        onClick={() => setShowBankReport(prev => !prev)}
                      >
                        {showBankReport ? 'Ocultar' : 'Ver cuentas'}
                      </button>
                    </div>
                    {showBankReport && (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {(['ALL', 'WITH', 'WITHOUT'] as const).map(option => (
                            <button
                              key={`bank-filter-${option}`}
                              type="button"
                              onClick={() => setBankFilter(option)}
                              className={`rounded-full border px-3 py-1 font-semibold ${
                                bankFilter === option
                                  ? 'border-blue-500 bg-blue-100 text-blue-700'
                                  : 'border-slate-300 text-slate-600'
                              }`}
                            >
                              {option === 'ALL' && 'Todos'}
                              {option === 'WITH' && 'Con cuenta'}
                              {option === 'WITHOUT' && 'Sin cuenta'}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="rounded border border-blue-500 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                            onClick={handlePrintBankReport}
                            disabled={!filteredAccountsRows.length}
                          >
                            Imprimir cuentas
                          </button>
                        </div>
                        {!filteredAccountsRows.length ? (
                          <p className="mt-3 text-sm text-slate-500">No hay registros para este filtro.</p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-100 text-left uppercase tracking-wide text-slate-600">
                                <tr>
                                  <th className="px-3 py-2">Trabajador</th>
                                  <th className="px-3 py-2">Banco</th>
                                  <th className="px-3 py-2">Número de cuenta</th>
                                  <th className="px-3 py-2">CCI</th>
                                  <th className="px-3 py-2">Yape/Plin</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredAccountsRows.map(row => (
                                  <tr key={`bank-row-${row.worker}`} className="border-b border-slate-100">
                                    <td className="px-3 py-2 font-medium text-slate-700">{row.worker}</td>
                                    <td className="px-3 py-2">{row.bank}</td>
                                    <td className="px-3 py-2">{row.account}</td>
                                    <td className="px-3 py-2">{row.cci}</td>
                                    <td className="px-3 py-2">{row.yapePlin}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Selecciona un periodo para ver sus boletas.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

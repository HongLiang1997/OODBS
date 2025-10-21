import React from "react";

export default function EditModal({ 
  title, 
  data, 
  columns, 
  onChange, 
  onClose, 
  onSave, 
  saving 
}) {
  if (!data) return null;

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog" role="document">
        <form onSubmit={onSave} className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            {columns.map(({ key, label, editable, inputType = "text", options }) => {
              if (!editable) return null;
              
              return (
                <div className="mb-3" key={key}>
                  <label className="form-label">{label}</label>
                  {inputType === "select" ? (
                    <select
                      className="form-select"
                      name={key}
                      value={data[key] ?? ""}
                      onChange={onChange}
                      required
                    >
                      {options.map((opt) => (
                        <option key={opt.key || opt.value} value={opt.key ?? opt.value}>
                          {opt.label ?? opt.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={inputType}
                      className="form-control"
                      name={key}
                      value={data[key] ?? ""}
                      onChange={onChange}
                      min={inputType === "number" ? 1 : undefined}
                      placeholder={inputType === "password" ? "Enter new password or leave empty to keep current" : undefined}
                      autocomplete={inputType === "email" ? "new-email" : inputType === "password" ? "new-password" : "off"}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="modal-footer">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

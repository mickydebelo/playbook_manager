/* @ds-bundle: {"format":4,"namespace":"AutodeskDesignSystem_c63964","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"IconButton","sourcePath":"components/buttons/IconButton.jsx"},{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"},{"name":"Tooltip","sourcePath":"components/overlay/Tooltip.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"62ba84669391","components/buttons/IconButton.jsx":"6c27ce40abf0","components/data-display/Badge.jsx":"969f2f5d5f99","components/data-display/Card.jsx":"6222e010708d","components/forms/Checkbox.jsx":"a2e2784cb2da","components/forms/Input.jsx":"453f2cb6e703","components/forms/Radio.jsx":"536f0c459b9b","components/forms/Select.jsx":"e9aa548a49dd","components/forms/Switch.jsx":"f7a278d072f6","components/navigation/Tabs.jsx":"dc80fd4e8e6a","components/overlay/Dialog.jsx":"918e44d8cb19","components/overlay/Tooltip.jsx":"d376c1451552"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AutodeskDesignSystem_c63964 = window.AutodeskDesignSystem_c63964 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
const SIZES = {
  sm: {
    pad: '8px 16px',
    font: 'var(--text-body-sm)'
  },
  md: {
    pad: '11px 20px',
    font: 'var(--text-button)'
  },
  lg: {
    pad: '15px 28px',
    font: '700 16px/20px var(--font-element)'
  }
};
const VARIANTS = {
  primary: {
    background: 'var(--adsk-black)',
    color: 'var(--adsk-white)',
    border: '1px solid var(--adsk-black)'
  },
  inverse: {
    background: 'var(--adsk-white)',
    color: 'var(--adsk-black)',
    border: '1px solid var(--adsk-white)'
  },
  secondary: {
    background: 'transparent',
    color: 'var(--adsk-black)',
    border: '1px solid var(--adsk-black)'
  },
  'secondary-inverse': {
    background: 'transparent',
    color: 'var(--adsk-white)',
    border: '1px solid var(--adsk-white)'
  },
  accent: {
    background: 'var(--hello-yellow)',
    color: 'var(--adsk-black)',
    border: '1px solid var(--hello-yellow)'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--adsk-black)',
    border: '1px solid transparent'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  icon,
  children,
  onClick,
  style
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;
  const [hover, setHover] = React.useState(false);
  return React.createElement('button', {
    disabled,
    onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      fontFamily: 'var(--font-element)',
      font: s.font,
      padding: s.pad,
      borderRadius: 'var(--radius-sm)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      opacity: disabled ? 0.4 : hover ? 0.8 : 1,
      transition: 'opacity .15s ease',
      ...v,
      ...style
    }
  }, icon ? React.createElement('span', {
    style: {
      display: 'inline-flex',
      width: 16,
      height: 16
    }
  }, icon) : null, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/buttons/IconButton.jsx
try { (() => {
function IconButton({
  icon,
  variant = 'secondary',
  size = 32,
  onClick,
  label
}) {
  const [hover, setHover] = React.useState(false);
  const isDark = variant === 'primary';
  return React.createElement('button', {
    onClick,
    'aria-label': label,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: isDark ? 'var(--adsk-black)' : 'transparent',
      color: isDark ? 'var(--adsk-white)' : 'var(--adsk-black)',
      border: isDark ? 'none' : '1px solid var(--slate-200)',
      cursor: 'pointer',
      opacity: hover ? 0.75 : 1
    }
  }, icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Badge.jsx
try { (() => {
const TONES = {
  neutral: {
    background: 'var(--slate-100)',
    color: 'var(--adsk-black)'
  },
  info: {
    background: 'var(--twilight-100)',
    color: 'var(--twilight-700)'
  },
  positive: {
    background: 'var(--morning-100)',
    color: 'var(--morning-700)'
  },
  warning: {
    background: 'var(--dawn-100)',
    color: 'var(--dawn-700)'
  },
  critical: {
    background: 'var(--dusk-100)',
    color: 'var(--dusk-700)'
  },
  highlight: {
    background: 'var(--hello-yellow)',
    color: 'var(--adsk-black)'
  }
};
function Badge({
  tone = 'neutral',
  children
}) {
  const t = TONES[tone] || TONES.neutral;
  return React.createElement('span', {
    style: {
      ...t,
      font: 'var(--text-label)',
      fontFamily: 'var(--font-element)',
      padding: '3px 10px',
      borderRadius: 'var(--radius-sm)',
      display: 'inline-block',
      letterSpacing: '.02em'
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data-display/Card.jsx
try { (() => {
function Card({
  title,
  body,
  tag,
  image,
  dark = false,
  children
}) {
  return React.createElement('div', {
    style: {
      background: dark ? 'var(--adsk-black)' : 'var(--adsk-white)',
      color: dark ? 'var(--adsk-white)' : 'var(--adsk-black)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-card)',
      border: dark ? 'none' : '1px solid var(--slate-100)',
      overflow: 'hidden',
      fontFamily: 'var(--font-element)',
      width: 280
    }
  }, image ? React.createElement('div', {
    style: {
      height: 140,
      background: `center/cover url(${image})`
    }
  }) : null, React.createElement('div', {
    style: {
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, tag ? React.createElement('span', {
    style: {
      font: 'var(--text-label)',
      color: 'var(--slate)'
    }
  }, tag) : null, title ? React.createElement('h3', {
    style: {
      font: 'var(--text-h4)',
      margin: 0
    }
  }, title) : null, body ? React.createElement('p', {
    style: {
      font: 'var(--text-body-sm)',
      margin: 0,
      color: dark ? 'var(--warm-slate)' : 'var(--slate)'
    }
  }, body) : null, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data-display/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  checked,
  onChange,
  disabled
}) {
  return React.createElement('label', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: 'var(--font-element)',
      font: 'var(--text-body-sm)',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, React.createElement('span', {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 18,
      height: 18,
      borderRadius: 4,
      border: `1px solid ${checked ? 'var(--adsk-black)' : 'var(--slate-300)'}`,
      background: checked ? 'var(--adsk-black)' : 'var(--adsk-white)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, checked ? React.createElement('svg', {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'var(--adsk-white)',
    strokeWidth: 3
  }, React.createElement('path', {
    d: 'M5 13l4 4L19 7'
  })) : null), label);
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function Input({
  label,
  placeholder,
  error,
  disabled,
  type = 'text'
}) {
  const [focus, setFocus] = React.useState(false);
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-element)',
      width: 240
    }
  }, label ? React.createElement('label', {
    style: {
      font: 'var(--text-label)',
      color: 'var(--adsk-black)'
    }
  }, label) : null, React.createElement('input', {
    type,
    placeholder,
    disabled,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      font: 'var(--text-body)',
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${error ? 'var(--dusk)' : focus ? 'var(--twilight)' : 'var(--slate-200)'}`,
      outline: 'none',
      background: disabled ? 'var(--slate-100)' : 'var(--adsk-white)',
      color: 'var(--adsk-black)'
    }
  }), error ? React.createElement('span', {
    style: {
      font: 'var(--text-caption)',
      color: 'var(--dusk-700)'
    }
  }, error) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function Radio({
  label,
  checked,
  onChange,
  disabled
}) {
  return React.createElement('label', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: 'var(--font-element)',
      font: 'var(--text-body-sm)',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, React.createElement('span', {
    onClick: () => !disabled && onChange && onChange(true),
    style: {
      width: 18,
      height: 18,
      borderRadius: '50%',
      border: `1px solid ${checked ? 'var(--adsk-black)' : 'var(--slate-300)'}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, checked ? React.createElement('span', {
    style: {
      width: 9,
      height: 9,
      borderRadius: '50%',
      background: 'var(--adsk-black)'
    }
  }) : null), label);
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function Select({
  label,
  options = [],
  value,
  onChange,
  disabled
}) {
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontFamily: 'var(--font-element)',
      width: 240
    }
  }, label ? React.createElement('label', {
    style: {
      font: 'var(--text-label)'
    }
  }, label) : null, React.createElement('select', {
    value,
    disabled,
    onChange: e => onChange && onChange(e.target.value),
    style: {
      font: 'var(--text-body)',
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--slate-200)',
      background: disabled ? 'var(--slate-100)' : 'var(--adsk-white)',
      color: 'var(--adsk-black)'
    }
  }, options.map(o => React.createElement('option', {
    key: o,
    value: o
  }, o))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  checked,
  onChange,
  disabled,
  label
}) {
  return React.createElement('label', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontFamily: 'var(--font-element)',
      font: 'var(--text-body-sm)',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer'
    }
  }, React.createElement('span', {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 36,
      height: 20,
      borderRadius: 999,
      background: checked ? 'var(--adsk-black)' : 'var(--slate-200)',
      position: 'relative',
      transition: 'background .15s'
    }
  }, React.createElement('span', {
    style: {
      position: 'absolute',
      top: 2,
      left: checked ? 18 : 2,
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: 'var(--adsk-white)',
      transition: 'left .15s'
    }
  })), label);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items = [],
  active,
  onChange
}) {
  return React.createElement('div', {
    style: {
      display: 'flex',
      gap: 24,
      borderBottom: '1px solid var(--slate-200)',
      fontFamily: 'var(--font-element)'
    }
  }, items.map(item => React.createElement('button', {
    key: item,
    onClick: () => onChange && onChange(item),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '10px 0',
      font: 'var(--text-body-sm)',
      color: item === active ? 'var(--adsk-black)' : 'var(--slate)',
      fontWeight: item === active ? 700 : 400,
      borderBottom: item === active ? '2px solid var(--adsk-black)' : '2px solid transparent',
      marginBottom: -1
    }
  }, item)));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
function Dialog({
  open,
  title,
  body,
  onClose,
  primaryLabel = 'Continue',
  onPrimary
}) {
  if (!open) return null;
  return React.createElement('div', {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-element)'
    }
  }, React.createElement('div', {
    style: {
      background: 'var(--adsk-white)',
      borderRadius: 'var(--radius-xl)',
      padding: 32,
      width: 360,
      boxShadow: 'var(--shadow-card)'
    }
  }, React.createElement('h3', {
    style: {
      font: 'var(--text-h3)',
      fontFamily: 'var(--font-legend)',
      margin: '0 0 12px'
    }
  }, title), React.createElement('p', {
    style: {
      font: 'var(--text-body)',
      color: 'var(--slate)',
      margin: '0 0 24px'
    }
  }, body), React.createElement('div', {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'flex-end'
    }
  }, React.createElement('button', {
    onClick: onClose,
    style: {
      background: 'none',
      border: 'none',
      font: 'var(--text-button)',
      fontFamily: 'var(--font-element)',
      cursor: 'pointer',
      padding: '11px 16px'
    }
  }, 'Cancel'), React.createElement('button', {
    onClick: onPrimary,
    style: {
      background: 'var(--adsk-black)',
      color: 'var(--adsk-white)',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      font: 'var(--text-button)',
      fontFamily: 'var(--font-element)',
      cursor: 'pointer',
      padding: '11px 20px'
    }
  }, primaryLabel))));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Tooltip.jsx
try { (() => {
function Tooltip({
  label,
  children
}) {
  const [show, setShow] = React.useState(false);
  return React.createElement('span', {
    style: {
      position: 'relative',
      display: 'inline-block'
    },
    onMouseEnter: () => setShow(true),
    onMouseLeave: () => setShow(false)
  }, children, show ? React.createElement('span', {
    style: {
      position: 'absolute',
      bottom: '125%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--adsk-black)',
      color: 'var(--adsk-white)',
      font: 'var(--text-caption)',
      fontFamily: 'var(--font-element)',
      padding: '6px 10px',
      borderRadius: 'var(--radius-sm)',
      whiteSpace: 'nowrap',
      zIndex: 10
    }
  }, label) : null);
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Tooltip.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();

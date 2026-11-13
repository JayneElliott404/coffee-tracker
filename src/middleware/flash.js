// Minimal replacement for connect-flash, which relies on the deprecated util.isArray.
export function flash(req, res, next) {
  req.flash = (type, message) => {
    const store = (req.session.flash ??= {});
    if (message === undefined) {
      const messages = store[type] ?? [];
      delete store[type];
      return messages;
    }
    (store[type] ??= []).push(message);
  };
  next();
}

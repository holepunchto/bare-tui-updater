const { style } = require('bare-tui')

const defaultTheme = {
  accent: (s) => style().foreground('cyan').render(s),
  success: (s) => style().foreground('green').render(s),
  error: (s) => style().foreground('red').render(s),
  hint: (s) => style().faint(true).render(s),
  border: style.borders.rounded
}

function merge(user) {
  return { ...defaultTheme, ...(user || {}) }
}

module.exports = { defaultTheme, merge }

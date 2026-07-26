// Tiny flag parser shared by the examples so you can try every layout option
// without editing code:
//
//   bare examples/minimal.js --position top --align right --no-border --width 50
//
const POSITIONS = ['top', 'bottom']
const ALIGNMENTS = ['left', 'center', 'right']
const BORDERS = ['rounded', 'normal', 'thick', 'double', 'none']

function parse(argv = Bare.argv.slice(2)) {
  const opts = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--position':
      case '-p':
        opts.position = pick(argv[++i], POSITIONS, arg)
        break
      case '--align':
      case '-a':
        opts.align = pick(argv[++i], ALIGNMENTS, arg)
        break
      case '--width':
      case '-w': {
        const v = argv[++i]
        if (v !== 'auto' && !Number.isFinite(Number(v))) bail(`${arg} wants a number or 'auto'`)
        opts.width = v === 'auto' ? 'auto' : Number(v)
        break
      }
      case '--border':
        opts.border = pick(argv[++i], BORDERS, arg)
        break
      case '--no-border':
        opts.border = false
        break
      case '--help':
      case '-h':
        console.log(usage())
        Bare.exit(0)
        break
      default:
        bail(`unknown flag: ${arg}`)
    }
  }

  return opts
}

function pick(value, allowed, flag) {
  if (!allowed.includes(value)) bail(`${flag} wants one of: ${allowed.join(', ')}`)
  return value
}

function bail(message) {
  console.log(`${message}\n\n${usage()}`)
  Bare.exit(1)
}

function usage() {
  return [
    'Options:',
    '  -p, --position top|bottom      where the banner sits (default bottom)',
    '  -a, --align left|center|right  horizontal alignment (default left)',
    '  -w, --width <n>|auto           outer width (default 64 boxed, auto borderless)',
    '      --border <name>            rounded|normal|thick|double|none',
    '      --no-border                render a single line instead of a box',
    '  -h, --help                     show this'
  ].join('\n')
}

function describe(opts) {
  const border = opts.border === false ? 'none' : opts.border || 'rounded'
  return `position=${opts.position || 'bottom'}  align=${opts.align || 'left'}  border=${border}  width=${opts.width || 'default'}`
}

module.exports = { parse, usage, describe }

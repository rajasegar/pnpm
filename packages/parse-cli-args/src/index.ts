import findWorkspaceDir from '@pnpm/find-workspace-dir'
import nopt = require('nopt')

const RECURSIVE_CMDS = new Set(['recursive', 'multi', 'm'])

export interface ParsedCliArgs {
  argv: {
    remain: string[],
    cooked: string[],
    original: string[],
  }
  params: string[]
  // tslint:disable-next-line: no-any
  options: Record<string, any>
  cmd: string | null
  unknownOptions: string[]
  workspaceDir?: string
}

export default async function parseCliArgs (
  opts: {
    getCommandLongName: (commandName: string) => string | null,
    getTypesByCommandName: (commandName: string) => object,
    renamedOptions?: Record<string, string>,
    shorthandsByCommandName: Record<string, Record<string, string>>,
    universalOptionsTypes: Record<string, unknown>,
    universalShorthands: Record<string, string>,
  },
  inputArgv: string[],
): Promise<ParsedCliArgs> {
  const noptExploratoryResults = nopt(
    {
      filter: [String],
      help: Boolean,
      recursive: Boolean,
      ...opts.universalOptionsTypes,
      ...opts.getTypesByCommandName('add'),
      ...opts.getTypesByCommandName('install'),
    },
    {
      'r': '--recursive',
      ...opts.universalShorthands,
    },
    inputArgv,
    0,
  )
  if (noptExploratoryResults['help']) {
    return {
      argv: noptExploratoryResults.argv,
      cmd: 'help',
      options: {},
      params: noptExploratoryResults.argv.remain,
      unknownOptions: [] as string[],
    }
  }

  const recursiveCommandUsed = RECURSIVE_CMDS.has(noptExploratoryResults.argv.remain[0])
  const commandName = getCommandName(noptExploratoryResults.argv.remain)
  let cmd = commandName ? opts.getCommandLongName(commandName) : null
  const types = {
    ...opts.universalOptionsTypes,
    ...opts.getTypesByCommandName(commandName),
  } as any // tslint:disable-line:no-any

  function getCommandName (args: string[]) {
    if (recursiveCommandUsed) {
      args = args.slice(1)
    }
    if (opts.getCommandLongName(args[0]) !== 'install' || args.length === 1) {
      return args[0]
    }
    return 'add'
  }

  const { argv, ...options } = nopt(
    {
      'recursive': Boolean,
      ...types,
    },
    {
      ...opts.universalShorthands,
      ...opts.shorthandsByCommandName[commandName],
    },
    inputArgv,
    0,
  )

  if (opts.renamedOptions) {
    for (const cliOption of Object.keys(options)) {
      if (opts.renamedOptions[cliOption]) {
        options[opts.renamedOptions[cliOption]] = options[cliOption]
        delete options[cliOption]
      }
    }
  }

  // `pnpm install ""` is going to be just `pnpm install`
  const params = argv.remain.slice(1).filter(Boolean)

  if (options['recursive'] !== true && (options['filter'] || recursiveCommandUsed)) {
    options['recursive'] = true
    let subCmd: string | null = argv.remain[1] && opts.getCommandLongName(argv.remain[1])
    if (subCmd && recursiveCommandUsed) {
      params.shift()
      argv.remain.shift()
      cmd = subCmd
    }
  }
  const dir = options['dir'] ?? process.cwd()
  const workspaceDir = options['global'] // tslint:disable-line
    ? undefined
    : await findWorkspaceDir(dir)

  if (
    (cmd === 'add' || cmd === 'install') &&
    typeof workspaceDir === 'string' &&
    params.length === 0
  ) {
    options['recursive'] = true
  }

  if (cmd === 'install' && params.length > 0) {
    cmd = 'add'
  }
  if (!cmd && options['recursive']) {
    cmd = 'recursive'
  }

  const allowedOptions = new Set(Object.keys(types))
  const unknownOptions = [] as string[]
  for (const cliOption of Object.keys(options)) {
    if (!allowedOptions.has(cliOption) && !cliOption.startsWith('//')) {
      unknownOptions.push(cliOption)
    }
  }
  return {
    argv,
    cmd,
    options,
    params,
    unknownOptions,
    workspaceDir,
  }
}

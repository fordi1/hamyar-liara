import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants.js'

const previewBuild = process.env.TEABLE_PREVIEW === '1' && existsSync('./.teable/preview-source-loader.cjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  allowedDevOrigins: ['**.*'],
  logging: {
    browserToTerminal: 'error',
  },
  env: {
    NEXT_PUBLIC_TEABLE_PREVIEW: previewBuild ? '1' : '0',
  },
  ...(previewBuild ? {
    outputFileTracingRoot: process.cwd(),
    turbopack: {
      root: process.cwd(),
      rules: Object.fromEntries(['*.tsx', '*.jsx', '*.js'].map((pattern) => [pattern, {
        condition: { not: 'foreign' },
        loaders: [{ loader: './.teable/preview-source-loader.cjs', options: { projectDir: process.cwd() } }],
      }])),
    },
  } : {}),
}

// tsconfig.teable.json exists only in the Teable sandbox (injected, gitignored);
// the dev-phase guard keeps production builds on the app's own tsconfig.
export default (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.TEABLE_APP_TOKEN && existsSync('./teable/queries.yaml')) {
    execFileSync(process.execPath, ['teable/query-tool.mjs', 'check', '--live'], { stdio: 'inherit' })
  }
  return phase === PHASE_DEVELOPMENT_SERVER && existsSync('./tsconfig.teable.json')
    ? {
        ...nextConfig,
        typescript: { ...nextConfig.typescript, tsconfigPath: 'tsconfig.teable.json' },
      }
    : nextConfig
}

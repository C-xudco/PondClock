module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  extends: ['eslint:recommended', 'plugin:react-hooks/recommended'],
  plugins: ['react'],
  settings: { react: { version: 'detect' } },
  rules: { 'react/jsx-uses-react': 'error', 'react/jsx-uses-vars': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] },
  ignorePatterns: ['node_modules/', '.pnpm-store/', 'build/', 'build-desktop/', 'release/', 'src/components/ui/', 'test-results/'],
};

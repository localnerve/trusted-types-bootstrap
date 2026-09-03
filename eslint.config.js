import js from '@eslint/js';
import globals from 'globals';
import nodePlugin from 'eslint-plugin-n';

const nodeRules = nodePlugin.configs['flat/recommended'].rules;
const commonRules = {
  indent: [2, 2, {
    SwitchCase: 1,
    MemberExpression: 1
  }],
  quotes: [2, 'single'],
  'dot-notation': [2, {allowKeywords: true}]
};

export default [{
  name: 'global',
  ignores: [
    'coverage/**'
  ]
}, {
  name: 'test-fixtures',
  files: [
    '__tests__/fixtures/**/*'
  ],
  languageOptions: {
    globals: {
      ...globals.browser
    }
  }
}, {
  name: 'test',
  plugins: { n: nodePlugin },
  files: [
    '__tests__/**/*.spec.js'
  ],
  languageOptions: {
    globals: {
      ...globals.node
    }
  },
  rules: {
    ...js.configs.recommended.rules,
    ...nodeRules,
    ...commonRules,
    'n/no-unsupported-features/node-builtins': ['error', {
      'ignores': ['import.meta.dirname', 'test.describe'],
      'allowExperimental': true
    }],
  }
}, {
  name: 'lib',
  plugins: { n: nodePlugin },
  files: [
    'index.js',
    'lib/**'
  ],
  languageOptions: {
    globals: {
      ...globals.node,
      ...globals.browser
    }
  },
  rules: {
    ...js.configs.recommended.rules,
    ...nodeRules,
    ...commonRules
  }
}];

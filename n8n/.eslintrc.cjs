module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: { sourceType: "module", ecmaVersion: 2022 },
  plugins: ["eslint-plugin-n8n-nodes-base"],
  ignorePatterns: ["dist/**", "node_modules/**"],
  overrides: [
    {
      files: ["package.json"],
      plugins: ["eslint-plugin-n8n-nodes-base"],
      extends: ["plugin:n8n-nodes-base/community"],
    },
    {
      files: ["./credentials/**/*.ts"],
      plugins: ["eslint-plugin-n8n-nodes-base"],
      extends: ["plugin:n8n-nodes-base/credentials"],
      rules: {
        "n8n-nodes-base/cred-class-field-documentation-url-miscased": "off",
      },
    },
    {
      files: ["./nodes/**/*.ts"],
      plugins: ["eslint-plugin-n8n-nodes-base"],
      extends: ["plugin:n8n-nodes-base/nodes"],
      rules: {
        "n8n-nodes-base/node-class-description-inputs-wrong-regular-node": "off",
        "n8n-nodes-base/node-class-description-outputs-wrong": "off",
      },
    },
  ],
};

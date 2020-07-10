/** @format */

module.exports = {
    extends: [
        "react-app",
        "prettier",
        "eslint:recommended",
        "plugin:react/recommended",
        "plugin:cypress/recommended",
        "plugin:@typescript-eslint/recommended",
        "prettier/@typescript-eslint",
        "plugin:prettier/recommended",
    ],
    rules: {
        "no-console": "off",
        "@typescript-eslint/camelcase": "off",
        "@typescript-eslint/explicit-function-return-type": ["off"],
        "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        "react/prop-types": "off",
        "react/display-name": "off",
        "no-unused-expressions": "off",
        "no-useless-concat": "off",
        "no-useless-constructor": "off",
        "no-unexpected-multiline": "off",
        "default-case": "off",
        "@typescript-eslint/no-use-before-define": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-empty-interface": "off",
        "@typescript-eslint/ban-ts-ignore": "off",
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/ban-types": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/no-var-requires": "off",
        "react-hooks/exhaustive-deps": "error",
    },
    plugins: ["cypress", "@typescript-eslint", "react-hooks"],
    env: { "cypress/globals": true },
    settings: {
        react: {
            pragma: "React",
            version: "16.6.0",
        },
    },
};

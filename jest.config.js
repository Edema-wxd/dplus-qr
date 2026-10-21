/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Keep the suite honest about the redirect path: these modules must stay
  // free of framework and UI imports.
  collectCoverageFrom: ["src/lib/**/*.ts"],
};

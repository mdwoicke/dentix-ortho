# Coding Conventions

**Analysis Date:** 2026-02-02

## Naming Patterns

**Files:**
- Controllers: `{resource}Controller.ts` (e.g., `authController.ts`, `patientController.ts`)
- Services: `{resource}Service.ts` (e.g., `authService.ts`, `cacheService.ts`)
- Models: `{Resource}.ts` PascalCase (e.g., `User.ts`, `UserModel.ts`)
- Types: `{domain}.ts` (e.g., `cloud9.ts`, `database.ts`)
- Utilities: `{function}.ts` (e.g., `logger.ts`, `cn.ts`)
- React components: `{ComponentName}.tsx` PascalCase
- Test files: `*.test.js` or `*.spec.js` (minimal testing - see TESTING.md)

**Functions:**
- camelCase for all function names
- Async functions: prefix describes action (`authenticate`, `verifyToken`, `callCloud9`)
- Event handlers: `on{EventName}` pattern (e.g., `onSelect`, `onRun`, `onEdit`)
- React hooks: `use{Name}` pattern
- Services/Utilities: verb-noun pattern (`hashPassword`, `generateToken`, `parseXmlResponse`)

**Variables:**
- camelCase for all variables and constants
- Constants at module level: SCREAMING_SNAKE_CASE (e.g., `JWT_SECRET`, `SALT_ROUNDS`)
- Configuration objects: camelCase or PascalCase objects with camelCase properties
- Boolean variables: `is{Property}` or `has{Property}` prefix (e.g., `isLoading`, `isSelected`, `isAdmin`)

**Types:**
- Interface names: `{Name}` PascalCase with optional `I` prefix (e.g., `Cloud9Location`, `ButtonProps`)
- Union types: descriptive names (e.g., `ButtonVariant`, `Environment`)
- Generic types: `T`, `U`, `K`, `V` single letters or descriptive (e.g., `TResponse`, `TData`)
- Field names in interfaces: camelCase (backend models use API field names like `PatientGUID` when matching Cloud9 API)

## Code Style

**Formatting:**
- No explicit linter config found; code follows general TypeScript conventions
- Indentation: 2 spaces (inferred from package.json and React components)
- Line length: No enforced limit (files vary)
- String quotes: single quotes in most files, backticks for template literals

**Linting:**
- Frontend: ESLint with TypeScript support (`frontend/eslint.config.js`)
  - Rules: Recommended ESLint + TypeScript ESLint + React Hooks + React Refresh
  - No custom rule overrides detected
  - Global ignore: `dist/` directory
- Backend: No ESLint detected; TypeScript compiler provides type checking
  - Strict mode enabled in `backend/tsconfig.json`
  - `noUnusedLocals` and `noUnusedParameters` enabled
  - `noImplicitReturns` and `noFallthroughCasesInSwitch` enforced

**TypeScript Configuration:**

Backend (`backend/tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

Frontend (`frontend/tsconfig.app.json`):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": false,
    "noUnusedLocals": false,
    "jsx": "react-jsx"
  }
}
```

## Import Organization

**Order (observed pattern):**
1. Node.js built-in modules (`fs`, `path`, `http`)
2. Third-party packages (`express`, `axios`, `react`, `winston`)
3. Type definitions (`type` imports)
4. Relative imports from `..` (parent dirs)
5. Relative imports from `.` (same dir)
6. Module imports with path aliases (`@shared/*`)

**Path Aliases:**
- Backend: `@shared/*` maps to `shared/*` (configured in `backend/tsconfig.json`)
- Frontend: Check `frontend/vite.config.ts` for alias configuration

**Example (Backend Service):**
```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, UserWithPermissions } from '../models/User';
import logger from '../utils/logger';
```

**Example (Frontend Component):**
```typescript
import { useState } from 'react';
import { clsx } from 'clsx';
import { CATEGORY_STYLES, type GoalTestCaseRecord } from '../../../types/testMonitor.types';
```

## Error Handling

**Patterns:**
- Custom `AppError` class with `statusCode` property (`backend/src/middleware/errorHandler.ts`)
- Errors are thrown and caught by `asyncHandler` wrapper
- Error messages are descriptive and user-facing where appropriate
- Stack traces logged only in development mode

**Custom Error Class:**
```typescript
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

**Async Route Wrapping:**
```typescript
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**Usage in Controllers:**
```typescript
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }
  // ... logic
});
```

**Try-catch patterns in services:**
- Explicit error checking for known failure modes
- Specific `AppError` thrown with appropriate status codes
- Generic errors converted to meaningful messages

```typescript
try {
  const result = await authenticate(email, password);
  if (!result) {
    throw new AppError('Invalid email or password', 401);
  }
  // ... success path
} catch (error) {
  if (error instanceof AppError) {
    throw error;
  }
  if ((error as Error).message === 'Account is disabled') {
    throw new AppError('Account is disabled...', 403);
  }
  throw new AppError('Invalid email or password', 401);
}
```

## Logging

**Framework:** Winston (backend only; frontend uses console)

**Backend Logger Usage:**
```typescript
import logger from '../utils/logger';

// Log levels: logger.error(), logger.warn(), logger.info(), logger.debug()
logger.error('Error occurred', {
  message: err.message,
  stack: err.stack,
  statusCode,
  path: _req.path,
  metadata: {}
});
```

**Patterns:**
- Structured logging with metadata object
- Errors logged with stack trace
- Log directory: `backend/logs/`
- Transports: File and console (configuration in `backend/src/utils/logger.ts`)

**Frontend Logging:**
- `console.log()`, `console.error()` used directly (no centralized logger)
- Limited production logging observed

## Comments

**When to Comment:**
- JSDoc comments for exported functions and interfaces
- Inline comments for complex logic or non-obvious algorithms
- Section headers in large files (e.g., `// ============================================================================`)
- Configuration files and domain-specific logic (Cloud9 API, test execution)

**JSDoc/TSDoc Pattern:**
```typescript
/**
 * POST /api/auth/login
 * Authenticate user and return token
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  // implementation
});
```

```typescript
/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}
```

**Avoid:**
- Over-commenting obvious code
- Outdated comments (keep in sync with changes)
- Commented-out code (remove or document why it's kept)

## Function Design

**Size:**
- Backend services: 40-100 lines typical
- Controllers: 15-50 lines (request validation + service call + response)
- React components: 100-300 lines (with nested icon components)
- Utility functions: 5-30 lines

**Parameters:**
- Max 3-4 parameters typical; use object destructuring for more
- Request/Response objects used directly in controllers
- Config objects spread with `{ ...options }`

**Return Values:**
- Services: Explicit return types in TypeScript
- Controllers: Always void (res.json() or error thrown)
- React hooks: State tuple or context value
- Utilities: Clear return type declarations

**Examples:**

Service:
```typescript
export async function authenticate(
  email: string,
  password: string
): Promise<LoginResult | null> {
  // ... implementation
  return { user, token };
}
```

Controller:
```typescript
export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authenticate(email, password);
  res.json({
    status: 'success',
    data: { user: result.user, token: result.token }
  });
});
```

## Module Design

**Exports:**
- Named exports for functions and classes
- Default exports rare (one per file)
- Barrel files not consistently used (check specific modules)

**Example Service Export:**
```typescript
export async function hashPassword(password: string): Promise<string> { }
export async function comparePassword(password: string, hash: string): Promise<boolean> { }
export function generateTempPassword(): string { }
export function generateToken(user: UserWithPermissions): string { }
export function verifyToken(token: string): JwtPayload | null { }
```

**Interfaces grouped with implementation:**
```typescript
export interface JwtPayload {
  userId: number;
  email: string;
  isAdmin: boolean;
}

export interface LoginResult {
  user: UserWithPermissions;
  token: string;
}
```

**React Component Exports:**
```typescript
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
  // component implementation
}
```

---

*Convention analysis: 2026-02-02*

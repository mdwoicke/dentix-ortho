# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- Backend TypeScript: camelCase for files, PascalCase for models/classes (e.g., `authController.ts`, `User.ts`)
- Frontend React: PascalCase for components (e.g., `Button.tsx`, `LoginPage.tsx`)
- Directories: kebab-case (e.g., `test-monitor/`, `goal-tests/`)
- Test scripts: kebab-case with underscores for internal scripts (e.g., `_check-session.js`, `analyze-flows.js`)

**Functions:**
- Controllers: camelCase async functions exported as named exports (e.g., `login`, `getCurrentUser`, `changePasswordHandler`)
- Services: camelCase methods, static class methods for models (e.g., `UserModel.getById()`, `authenticate()`)
- React components: PascalCase function names matching file names (e.g., `function Button()`)
- Async thunks: camelCase with createAsyncThunk (e.g., `initializeAuth`, `login`)

**Variables:**
- camelCase for all variables (e.g., `authHeader`, `tenantId`, `passwordHash`)
- SCREAMING_SNAKE_CASE for constants (e.g., `MASTER_ADMIN_EMAIL`, `STORAGE_KEYS`, `API_CONFIG`)
- Boolean variables: use `is`, `has`, `can` prefixes (e.g., `isAuthenticated`, `mustChangePassword`, `can_access`)

**Types:**
- PascalCase for interfaces and types (e.g., `User`, `AuthState`, `Cloud9Response`, `CreatePatientParams`)
- Suffix interfaces with descriptive names not "Interface" (e.g., `UserWithPermissions`, `CreateUserInput`, `UpdateUserInput`)
- Type exports: Use named exports for all types

## Code Style

**Formatting:**
- No Prettier config detected in backend
- Frontend uses ESLint with TypeScript plugin (`eslint.config.js`)
- 2-space indentation (standard TypeScript convention)
- Single quotes for strings in TypeScript
- Template literals for string interpolation

**Linting:**
- Frontend: ESLint 9.x with flat config, TypeScript ESLint, React Hooks plugin, React Refresh plugin
- Extends: `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`
- Backend: No ESLint config detected, relies on TypeScript compiler strict mode
- TypeScript strict mode enabled in both frontend and backend

**TypeScript Configuration:**
- Backend: CommonJS modules, ES2020 target, strict mode, path aliases (`@shared/*`)
- Frontend: Project references pattern (split app/node configs)
- Strict flags: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`

## Import Organization

**Order:**
1. External dependencies (React, Express, axios, etc.)
2. Internal middleware/utilities (errorHandler, logger)
3. Models (User, Tenant, etc.)
4. Services (authService, cloud9/client)
5. Routes (if in app.ts)
6. Types (imported last when needed)

**Path Aliases:**
- Backend: `@shared/*` for shared code
- Frontend: No path aliases detected, uses relative imports
- Relative imports preferred: `'../middleware/errorHandler'`, `'../../services/api/client'`

**Example Pattern (from `backend/src/controllers/authController.ts`):**
```typescript
import { Request, Response } from 'express';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { UserModel } from '../models/User';
import { TenantModel } from '../models/Tenant';
import { authenticate, changePassword, verifyToken } from '../services/authService';
```

## Error Handling

**Patterns:**
- Custom `AppError` class with `statusCode` and `isOperational` properties (`backend/src/middleware/errorHandler.ts`)
- `asyncHandler()` wrapper for all async controller functions - eliminates try-catch boilerplate
- Throw `AppError` instances for operational errors (e.g., `throw new AppError('Email and password are required', 400)`)
- Inline auth verification in controllers using `verifyToken()` helper - no middleware
- Try-catch used for service-level error transformation (e.g., converting DB errors to AppError)

**Controller Pattern (from `backend/src/controllers/authController.ts`):**
```typescript
export const login = asyncHandler(async (req: Request, res: Response) => {
  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }
  // Business logic - errors bubble up to asyncHandler
});
```

**Model Pattern (from `backend/src/models/User.ts`):**
```typescript
static create(input: CreateUserInput): number {
  try {
    // DB operation
  } catch (error) {
    if ((error as any)?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Email already exists');
    }
    throw new Error(`Error creating user: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

**Frontend Error Handling:**
- Axios interceptor catches and formats API errors (`frontend/src/services/api/client.ts`)
- `handleApiError()` normalizes AxiosError to `ApiError` type
- Redux async thunks use `rejectWithValue()` for error handling
- Toast notifications for user-facing errors

## Logging

**Framework:** Winston (`backend/src/utils/logger.ts`)

**Patterns:**
- Structured logging with metadata objects
- Custom logger helpers in `loggers` object for common scenarios
- Log levels: debug, info, error (controlled via `LOG_LEVEL` env var)
- Console + file transports (combined.log, error.log)
- Suppress console in test environment

**Usage Examples:**
```typescript
// Cloud 9 API logging
loggers.cloud9Request(procedure, environment, params);
loggers.cloud9Response(procedure, status, recordCount, error);

// Database operations
loggers.dbOperation('INSERT', 'users', { email: input.email });

// Cache operations
loggers.cacheHit(key, source);
loggers.cacheMiss(key, source);

// HTTP logging
loggers.httpRequest(method, path, ip);
loggers.httpResponse(method, path, statusCode, duration);
```

**Frontend Logging:**
- No structured logger detected
- Console methods used for debugging
- API errors logged via Winston in backend

## Comments

**When to Comment:**
- JSDoc blocks for all exported functions/classes with parameter descriptions
- File-level comments for purpose (e.g., `/** Auth Controller - Handles authentication endpoints */`)
- Inline comments for complex business logic or non-obvious code
- TODO/FIXME for known issues (used in codebase)

**JSDoc Pattern:**
```typescript
/**
 * POST /api/auth/login
 * Authenticate user and return token
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  // Implementation
});
```

**When NOT to Comment:**
- Self-explanatory code (e.g., `user.is_admin` doesn't need explanation)
- Variable declarations with clear names
- Simple utility functions

## Function Design

**Size:**
- Controllers: 20-60 lines typical, focused on single endpoint
- Models: Static methods, 10-40 lines each
- Services: Vary widely, 50-150 lines for complex operations acceptable

**Parameters:**
- Controllers: Extract from `req.body`, `req.params`, `req.header()`
- Services: Typed parameters (primitives or typed objects)
- Use destructuring for options: `{ email, password } = req.body`
- Optional parameters: Use TypeScript optional `?` syntax

**Return Values:**
- Controllers: Return void, use `res.json()` for responses
- Models: Return typed values (number for IDs, objects for records, void for updates)
- Services: Return typed promises or synchronous values
- Standard response format: `{ status: 'success', data: {...}, message?: string }`

**Example:**
```typescript
// Controller (void return, res.json side effect)
export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authenticate(email, password);
  res.json({ status: 'success', data: result });
});

// Model (typed return)
static getById(id: number): UserWithPermissions | null {
  const user = stmt.get(id) as Omit<User, 'password_hash'> | undefined;
  return user ? { ...user, permissions: UserModel.getPermissions(user.id) } : null;
}

// Service (typed promise)
export async function authenticate(email: string, password: string): Promise<AuthResult | null> {
  // Implementation
}
```

## Module Design

**Exports:**
- Named exports preferred (e.g., `export const login = ...`, `export class UserModel`)
- Default export for main module entity (e.g., Redux slices, API client)
- Export types separately from implementations

**Barrel Files:**
- Not extensively used
- Direct imports preferred (e.g., `import { UserModel } from '../models/User'`)

**Module Patterns:**
- Controllers: Named function exports
- Models: Static class pattern (e.g., `UserModel.getById()`)
- Services: Named function exports or classes
- Redux: Slice with default reducer export + named action/selector exports

**Example (from `frontend/src/store/slices/authSlice.ts`):**
```typescript
// Named exports for actions
export const { setEnvironment, toggleEnvironment, logout } = authSlice.actions;

// Named exports for selectors
export const selectEnvironment = (state: RootState) => state.auth.environment;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;

// Default export for reducer
export default authSlice.reducer;
```

## React/Frontend Specific

**Component Pattern:**
- Functional components only (no class components detected)
- TypeScript with typed props interfaces
- Props interfaces co-located with component (e.g., `interface ButtonProps extends React.ButtonHTMLAttributes`)
- Destructure props in function signature with defaults

**State Management:**
- Redux Toolkit with slices pattern
- `configureStore()` with middleware configuration
- Async thunks for side effects
- Selectors exported from slices

**Styling:**
- Tailwind CSS utility classes
- `cn()` utility for conditional class merging (from `frontend/src/utils/cn.ts`)
- Dark mode support via `dark:` prefixes
- Variant pattern for component styles (e.g., `variantStyles` object in Button.tsx)

**Example Component:**
```typescript
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return <button className={cn(variantStyles[variant], sizeStyles[size], className)} {...props}>{children}</button>;
}
```

## Backend Specific

**Model Pattern (Static Class Methods):**
```typescript
export class UserModel {
  static getAll(): UserWithPermissions[] { /* ... */ }
  static getById(id: number): UserWithPermissions | null { /* ... */ }
  static create(input: CreateUserInput): number { /* ... */ }
  static update(id: number, input: UpdateUserInput): void { /* ... */ }
}
```

**Controller Pattern (asyncHandler + inline auth):**
```typescript
export const protectedRoute = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    throw new AppError('Invalid or expired token', 401);
  }
  // Business logic with payload.userId
});
```

**Middleware:**
- CORS with custom headers (`X-Environment`, `X-Tenant-Id`) - `backend/src/middleware/cors.ts`
- Tenant context extraction from headers - `backend/src/middleware/tenantContext.ts`
- Error handling (global, not per-route) - `backend/src/middleware/errorHandler.ts`
- No auth middleware - auth checked inline in controllers

**API Response Format:**
```typescript
// Success
res.json({ status: 'success', data: {...}, message?: string });

// Error (via errorHandler middleware)
res.status(statusCode).json({ status: 'error', message: err.message });
```

---

*Convention analysis: 2026-02-09*

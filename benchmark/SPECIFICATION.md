# Octate Code Review Benchmark Suite: Specification

This document provides the authoritative ground-truth specification for all defects and false-positive traps contained in the Octate defect benchmark repository.

---

## 1. Correctness Defects

### Bug ID: CORR-01
- **File:** `src/users/userService.ts`
- **Expected line/range:** 45-48
- **Expected category:** correctness
- **Expected severity:** high
- **Why it is a real defect:**
  `user.preferences` is declared as an optional property (`UserPreferences | undefined`). In `getUserThemeMode`, the property chain `user.preferences.theme.mode` is dereferenced directly without optional chaining or null checking. When a user profile without preferences is passed, Node.js throws an unhandled `TypeError: Cannot read properties of undefined (reading 'theme')`, crashing the caller or failing the HTTP request.

### Bug ID: CORR-02
- **File:** `src/users/userService.ts`
- **Expected line/range:** 54-60
- **Expected category:** correctness
- **Expected severity:** critical
- **Why it is a real defect:**
  In `canAccessDashboard`, the conditional check `if (!user.isActive || user.isSuspended) return true;` inverts authorization logic. It explicitly returns `true` (granting access) when a user is inactive or suspended, while denying access to active, legitimate users. This logic inversion causes severe business logic failure and unauthorized account access.

### Bug ID: CORR-03
- **File:** `src/orders/orderService.ts`
- **Expected line/range:** 33-37
- **Expected category:** correctness
- **Expected severity:** high
- **Why it is a real defect:**
  `calculateFinalPrice` computes the discount amount via `const discountAmount = order.subtotal * discountRate;`, but erroneously returns `return discountAmount;` instead of the discounted subtotal (`order.subtotal - discountAmount`). As a consequence, checkout flows will charge the customer only the discount savings amount instead of the actual net total.

### Bug ID: CORR-04
- **File:** `src/orders/orderService.ts`
- **Expected line/range:** 43-52
- **Expected category:** correctness
- **Expected severity:** medium
- **Why it is a real defect:**
  In `getRecentTopOrders`, the pagination loop uses `for (let i = 0; i <= limit; i++)` instead of `< limit`. This loop condition executes `limit + 1` iterations, violating pagination contracts by returning an extra element beyond the client's requested page limit.

---

## 2. Security Defects

### Bug ID: SEC-01
- **File:** `src/system/systemTools.ts`
- **Expected line/range:** 8-12
- **Expected category:** security
- **Expected severity:** critical
- **Why it is a real defect:**
  `createBackupArchive` directly interpolates untrusted argument `outputArchiveName` into a raw shell command string executed synchronously via `execSync(\`tar -czf /tmp/${outputArchiveName}.tar.gz -C ${targetDirectory} .\`)`. An attacker supplying shell metacharacters (e.g. `; cat /etc/passwd #` or `$(whoami)`) achieves remote code execution (RCE) with the host privileges of the running Node.js process.

### Bug ID: SEC-02
- **File:** `src/storage/fileManager.ts`
- **Expected line/range:** 15-19
- **Expected category:** security
- **Expected severity:** critical
- **Why it is a real defect:**
  `readUploadedDocument` joins `this.uploadDir` with user-supplied `userFilename` using `path.join` and reads it immediately via `fs.readFileSync`. `path.join` resolves relative directory traversal sequences (`../`), allowing an attacker to pass filenames like `../../../../etc/shadow` to escape the upload root and read sensitive arbitrary files from the filesystem.

### Bug ID: SEC-03
- **File:** `src/users/userService.ts`
- **Expected line/range:** 66-76
- **Expected category:** security
- **Expected severity:** high
- **Why it is a real defect:**
  `updateUserEmail` accepts `actor: AuthContext` and `targetUserId: string`, but completely ignores `actor.userId` and `actor.roles`. It updates the target user's email address without asserting that `actor.userId === targetUserId` or checking for administrative privileges. This Insecure Direct Object Reference (IDOR) allows any authenticated user to hijack or overwrite any other user's credentials.

### Bug ID: SEC-04
- **File:** `src/config/authConfig.ts`
- **Expected line/range:** 6-9
- **Expected category:** security
- **Expected severity:** critical
- **Why it is a real defect:**
  Live production secrets (`STRIPE_LIVE_SECRET_KEY = 'sk_live_51M0...'` and `JWT_AUTH_SECRET = 'super_secret_...'`) are hard-coded in plaintext source files committed to version control. Committing private cryptographic keys and production payment gateway keys allows repository viewers or attackers to forge JWT authentication tokens and access merchant payment accounts.

---

## 3. Reliability Defects

### Bug ID: REL-01
- **File:** `src/storage/fileManager.ts`
- **Expected line/range:** 25-32
- **Expected category:** reliability
- **Expected severity:** medium
- **Why it is a real defect:**
  `cleanupTemporaryFile` wraps `fs.unlinkSync(filePath)` in a `try/catch` block with an empty `catch` body that suppresses all errors. Critical failures such as `EACCES` (permission denied), `EBUSY` (file locked by another process), or filesystem corruption are swallowed without logging, making silent storage exhaustion or state drift untraceable.

### Bug ID: REL-02
- **File:** `src/orders/orderService.ts`
- **Expected line/range:** 58-61
- **Expected category:** reliability
- **Expected severity:** high
- **Why it is a real defect:**
  `dispatchOrderNotification` calls `this.notifier.sendReceipt(order.id, email)` which returns a `Promise<void>`. The caller does not `await` the promise, does not return it, and does not attach a `.catch()` rejection handler. If the network drops or the notification service throws, it causes an unhandled promise rejection that can terminate the Node.js process.

### Bug ID: REL-03
- **File:** `src/storage/fileManager.ts`
- **Expected line/range:** 38-45
- **Expected category:** reliability
- **Expected severity:** high
- **Why it is a real defect:**
  `inspectFileHeader` opens a synchronous file descriptor via `fs.openSync` and attempts to close it with `fs.closeSync(fd)` after `fs.readSync`. Because the closing call is not placed in a `finally` block, any exception thrown during `readSync` or buffer allocation will bypass `closeSync(fd)`, permanently leaking the file descriptor. Under server workloads, this quickly exhausts OS file descriptor limits (`EMFILE`).

### Bug ID: REL-04
- **File:** `src/orders/orderService.ts`
- **Expected line/range:** 67-79
- **Expected category:** reliability
- **Expected severity:** high
- **Why it is a real defect:**
  `reserveStock` reads available inventory (`currentStock >= quantity`), yields the event loop during an asynchronous delay (`await ...`), and then updates the stored inventory. Under concurrent requests, multiple transactions will read the same initial inventory level before either writes back the deduction, leading to double-allocation and overselling inventory into negative values (TOCTOU race condition).

---

## 4. Performance Defects

### Bug ID: PERF-01
- **File:** `src/reports/reportGenerator.ts`
- **Expected line/range:** 15-30
- **Expected category:** performance
- **Expected severity:** medium
- **Why it is a real defect:**
  `findCommonTags` searches across nested arrays with `userB.tags.includes(tagA)` and `!common.includes(tagA)` inside multiple nested loops. For lists with $N$ and $M$ items, this causes quadratic $O(N \times M \times T^2)$ time complexity. On production datasets, this creates severe CPU thrashing and blocks the event loop.

### Bug ID: PERF-02
- **File:** `src/reports/reportGenerator.ts`
- **Expected line/range:** 36-46
- **Expected category:** performance
- **Expected severity:** medium
- **Why it is a real defect:**
  `validateLogRecords` re-compiles the same regular expression (`new RegExp(...)`) and re-calculates a static HMAC (`crypto.createHmac(...).update(...).digest(...)`) on every iteration inside `rawEntries.map()`. When processing large batches of logs (e.g. 50,000+ entries), this wastes millions of CPU cycles on redundant compilation and hashing that should be hoisted outside the loop.

### Bug ID: PERF-03
- **File:** `src/reports/reportGenerator.ts`
- **Expected line/range:** 52-62
- **Expected category:** performance
- **Expected severity:** high
- **Why it is a real defect:**
  `generateUserStatements` calls synchronous `fs.readFileSync(templatePath, 'utf-8')` inside a `for (const user of users)` loop. Reading the exact same static template repeatedly from disk inside a loop introduces disk I/O latency bottlenecks on every single user record and freezes the Node.js event loop.

---

## 5. False-Positive Traps (Benign Code)

These code patterns are intentionally designed to mimic suspicious patterns, but are verified safe and correct. AI reviewers should **NOT** report false-positive defects on these patterns.

### Trap ID: FP-TRAP-01
- **File:** `src/utils/safeHelpers.ts`
- **Line range:** 15-25
- **Pattern:** Looks like Path Traversal
- **Why it is NOT a defect:**
  `readContainedFile` accepts an external `userPath` and joins it with `baseDir`. However, lines 20-22 explicitly compute `target = path.resolve(root, userPath)` and verify `target.startsWith(root + path.sep)`. If `userPath` contains `../` sequences that escape `baseDir`, the check fails and throws an error before any file read occurs.

### Trap ID: FP-TRAP-02
- **File:** `src/utils/safeHelpers.ts`
- **Line range:** 30-37
- **Pattern:** Looks like SQL / Command Injection via String Interpolation
- **Why it is NOT a defect:**
  `buildSafeSortedQuery` interpolates `${sanitizedColumn}` directly into an SQL query string. However, line 34 verifies `userSortColumn` against a compile-time `ALLOWED_SORT_COLUMNS` Set allowlist. If the column is not an explicitly whitelisted safe identifier, it defaults to `'created_at'`. No unsanitized user input ever reaches the query string.

### Trap ID: FP-TRAP-03
- **File:** `src/utils/safeHelpers.ts`
- **Line range:** 42-53
- **Pattern:** Looks like a Swallowed Exception
- **Why it is NOT a defect:**
  `fileExists` uses `try/catch` around `fs.statSync`. However, line 48 specifically checks `if (error && error.code === 'ENOENT') return false;` to indicate non-existence (idiomatic Node.js pattern), while line 51 immediately re-throws any other errors (such as `EACCES` or hardware errors).

### Trap ID: FP-TRAP-04
- **File:** `src/utils/safeHelpers.ts`
- **Line range:** 8
- **Pattern:** Looks like a Hard-Coded Secret
- **Why it is NOT a defect:**
  `MOCK_SANDBOX_PUBLIC_KEY` is a client-side public publishable token (`pk_test_*`) explicitly created for sandbox testing. Public test tokens carry zero confidential privileges and are intended for public client-side browser exposure.

### Trap ID: FP-TRAP-05
- **File:** `src/utils/safeHelpers.ts`
- **Line range:** 59-74
- **Pattern:** Looks like Accidental $O(n^2)$ Complexity
- **Why it is NOT a defect:**
  `auditWeeklyScheduleCoverage` contains nested loops with `.includes()`. However, the outer loop is explicitly bounded to `DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6]`, which is a fixed constant of exactly 7 items. The complexity is $O(7 \times N) = O(N)$ linear time, not quadratic.

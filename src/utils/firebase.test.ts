import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleFirestoreError, OperationType } from './firebase.ts';

describe('Firebase Firestore Error Handler', () => {
  it('throws an error conforming to FirestoreErrorInfo JSON schema', () => {
    let capturedErr: Error | null = null;
    try {
      handleFirestoreError(new Error('Missing or insufficient permissions'), OperationType.CREATE, 'presets/p_123');
    } catch (e: any) {
      capturedErr = e;
    }

    assert.ok(capturedErr, 'Expected handleFirestoreError to throw');
    const parsed = JSON.parse(capturedErr.message);
    assert.equal(parsed.operationType, 'create');
    assert.equal(parsed.path, 'presets/p_123');
    assert.equal(parsed.error, 'Missing or insufficient permissions');
    assert.ok('authInfo' in parsed, 'authInfo object must be present');
  });

  it('handles non-Error objects safely', () => {
    let capturedErr: Error | null = null;
    try {
      handleFirestoreError('Network timeout', OperationType.LIST, 'presets');
    } catch (e: any) {
      capturedErr = e;
    }

    assert.ok(capturedErr);
    const parsed = JSON.parse(capturedErr.message);
    assert.equal(parsed.operationType, 'list');
    assert.equal(parsed.path, 'presets');
    assert.equal(parsed.error, 'Network timeout');
  });
});

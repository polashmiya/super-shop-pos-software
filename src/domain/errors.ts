/* ==========================================================================
   Application errors. Services throw AppError with a code that maps to an
   i18n key `errors.<code>`; the UI never shows raw technical messages.
   ========================================================================== */

export type ErrorCode =
  | 'unknown'
  | 'saveFailed'
  | 'loadFailed'
  | 'notFound'
  | 'permissionDenied'
  | 'approvalRequired'
  | 'cartEmpty'
  | 'cartFull'
  | 'invalidQuantity'
  | 'invalidPrice'
  | 'invalidDiscount'
  | 'discountAboveLimit'
  | 'discountReasonRequired'
  | 'stockInsufficient'
  | 'productInactive'
  | 'unknownBarcode'
  | 'paymentInsufficient'
  | 'paymentInvalid'
  | 'shiftNotOpen'
  | 'shiftAlreadyOpen'
  | 'shiftBelongsToOther'
  | 'differenceNeedsApproval'
  | 'duplicateBarcode'
  | 'duplicateSku'
  | 'duplicatePhone'
  | 'duplicateCode'
  | 'duplicateUsername'
  | 'returnWindowExpired'
  | 'returnQuantityInvalid'
  | 'saleNotReturnable'
  | 'saleNotCancellable'
  | 'cancelWindowExpired'
  | 'purchaseNotEditable'
  | 'purchaseNotReceivable'
  | 'receiveQuantityInvalid'
  | 'expenseNotEditable'
  | 'loginFailed'
  | 'lockedOut'
  | 'userInactive'
  | 'heldSalesFull'
  | 'importInvalid'
  | 'printFailed'
  | 'validation'
  | 'desktopOnly'
  | 'lastAdmin';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: Record<string, string | number>;
  override readonly cause?: unknown;

  constructor(code: ErrorCode, params: Record<string, string | number> = {}, cause?: unknown) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
    this.cause = cause;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Wraps any error as an AppError (unknown → the given fallback code). */
export function toAppError(error: unknown, fallback: ErrorCode = 'unknown'): AppError {
  if (error instanceof AppError) return error;
  return new AppError(fallback, {}, error);
}

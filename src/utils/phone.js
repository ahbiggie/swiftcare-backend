// LOAD-BEARING. The contract puts no uniqueness constraint on patient identity,
// so this normalizer is the only thing standing between the duplicate-detection
// workflow and a silently missed match. Every lane must call this one function —
// do not write a second normalizer.
//
// Contract: strip non-digits, then reduce to the national 0-prefixed form so
// +234 803..., 234803..., and 0803... all compare equal.

export function normalizePhone(raw) {
  if (!raw) return '';

  let digits = String(raw).replace(/\D/g, '');

  if (digits.startsWith('234')) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.length === 10) {
    // Local number typed without the leading zero (803...).
    digits = `0${digits}`;
  }

  return digits;
}

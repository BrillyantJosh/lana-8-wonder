/**
 * WHICH FREEZES STOP A LANA8WONDER ENROLMENT — THE OWNER'S RULE, 18.9.2026.
 *
 * Not every freeze means the same thing, and treating them alike was wrong in
 * both directions: first the freeze was invisible (so a frozen person was
 * walked into a refusal), then, in the first fix, every freeze blocked (so a
 * person the owner wants to let in was turned away).
 *
 * The owner's decision:
 *
 * - `frozen_max_cap` does NOT block. The wallet is frozen because its balance
 *   is above the published cap. The person enrols normally, and afterwards
 *   donates the remainder through the registrar down to zero, which releases
 *   the freeze. Enrolling is part of the way OUT of this freeze, so refusing
 *   it would lock the person into the very state it is meant to resolve.
 * - `frozen_own_person` does NOT block. It is a sanction against a person in
 *   the OWN process and says nothing about their coins; the owner ruled on
 *   9.9.2026 that it must not take away what a person has funded, and the
 *   registrar's own gate already waives it on this path.
 * - EVERY OTHER reason blocks — `frozen_too_wild`, `frozen_l8w`,
 *   `frozen_unreg_Lanas`, a bare `frozen`, a code nobody has written yet, and
 *   an EMPTY reason on a wallet marked frozen. Only exact strings pass. A
 *   reader more permissive than the writer honours a release nobody signed.
 *
 * And separately from all of this: a freeze state we could not READ is not a
 * freeze state that is absent. That is handled by the callers (`unreachable`,
 * `check_failed`) and stays fail-closed regardless of this table.
 */
export const MAX_CAP_FREEZE = 'frozen_max_cap';
export const OWN_PERSON_FREEZE = 'frozen_own_person';

export type EnrolmentFreezeVerdict =
  /** Not frozen at all. */
  | 'none'
  /** Frozen for the cap — may enrol; show the way out. */
  | 'max_cap'
  /** Frozen by an OWN-process sanction — may enrol. */
  | 'own_person'
  /** Frozen for any other reason, or with no reason — may not enrol. */
  | 'blocks';

export function enrolmentFreezeVerdict(
  frozen: boolean,
  reason: string | null | undefined,
): EnrolmentFreezeVerdict {
  const code = (reason || '').trim();
  // A reason on a wallet that claims not to be frozen still counts: the reason
  // is the more specific statement, and the permissive reading is the
  // dangerous one.
  if (!frozen && !code) return 'none';
  if (code === MAX_CAP_FREEZE) return 'max_cap';
  if (code === OWN_PERSON_FREEZE) return 'own_person';
  return 'blocks';
}

/** True when this freeze must stop the enrolment. */
export function freezeBlocksEnrolment(frozen: boolean, reason: string | null | undefined): boolean {
  return enrolmentFreezeVerdict(frozen, reason) === 'blocks';
}

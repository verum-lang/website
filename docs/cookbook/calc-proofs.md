---
title: Writing a small proof with `calc`
description: Equational proofs that read like algebra — step by step.
---

# `calc` proofs

A `calc` block proves an equality by showing a chain of steps, each
justified by a tactic or lemma. It reads like algebra homework.

### The simplest chain

```verum
theorem squaring(a: Int, b: Int) -> (a + b) * (a + b) == a*a + 2*a*b + b*b {
    calc {
        (a + b) * (a + b)
      == { by distributivity }   (a + b) * a + (a + b) * b
      == { by distributivity }   a*a + b*a + a*b + b*b
      == { by commutativity }    a*a + a*b + a*b + b*b
      == { by arithmetic }       a*a + 2*a*b + b*b
    }
}
```

Each `==` is a step. The `{ by … }` justifies the rewrite.

### Mixed relations

```verum
theorem bounded(x: Int { 0 <= self && self <= 10 }) -> x + 1 <= 11 {
    calc {
        x + 1
      <= { by refinement_bound } 10 + 1
      == { by arithmetic }       11
    }
}
```

A chain can mix `==`, `<=`, `<`, `>=`, `>` (monotonic in one
direction). Final relation is the **loosest** in the chain.

### With a named lemma

```verum
lemma reverse_reverse<T>(xs: List<T>) -> xs.reversed().reversed() == xs {
    by induction xs {
        case []            => qed;
        case [head, ..tail] => {
            calc {
                [head, ..tail].reversed().reversed()
              == { by def reversed }        (tail.reversed() ++ [head]).reversed()
              == { by reverse_append_lemma} [head] ++ tail.reversed().reversed()
              == { by ih }                  [head] ++ tail
              == { by def concat }          [head, ..tail]
            };
            qed
        }
    }
}
```

`by ih` references the inductive hypothesis — available when inside
`induction`.

### Sum-of-first-n proof

```verum
lemma sum_first_n(n: Int { self >= 0 }) -> sum(0..=n) == n * (n + 1) / 2 {
    by induction n {
        case 0 => {
            calc {
                sum(0..=0)
              == { by def sum }    0
              == { by arithmetic } 0 * (0 + 1) / 2
            }
        }
        case k + 1 => {
            calc {
                sum(0..=k+1)
              == { by def sum }    sum(0..=k) + (k+1)
              == { by ih }         k*(k+1)/2 + (k+1)
              == { by ring }       (k+1)*(k+2)/2
              == { by arithmetic } (k+1) * ((k+1) + 1) / 2
            }
        }
    }
}
```

### Named tactics

Common `by` tactics:

| Tactic | Use |
|---|---|
| `by auto` | try SMT + everything else |
| `by omega` | linear integer arithmetic |
| `by ring` | ring-axiom rewriting |
| `by simp [rules]` | simplification rewriting |
| `by arithmetic` | alias for `omega + ring` |
| `by def NAME` | unfold definition of `NAME` |
| `by distributivity`, `by commutativity`, `by associativity` | algebraic laws |
| `by ih` | inductive hypothesis (inside `induction`) |
| `by <lemma_name>` | reference a previously-proven lemma |

### Why `calc`?

Compared to a single `by auto`:

- **Readable**: each step documents *why* — useful in code review.
- **Robust**: if one step fails, you know exactly which.
- **Compositional**: named lemmas become reusable building blocks.
- **Fast**: SMT solves each step separately; small steps are
  faster than one huge goal.

### When `calc` isn't enough

- Proof requires case-split → use `match` on the scrutinee inside
  the proof block.
- Requires induction → wrap in `by induction x { case ... => calc { ... } }`.
- Uses function extensionality → `by ext; calc { ... }`.
- Requires higher-order reasoning → fall back to explicit proof
  terms.

### See also

- **[Verification → proofs](/docs/verification/proofs)** — full tactic
  DSL.
- **[Verified data structure tutorial](/docs/tutorials/verified-data-structure)**
  — loop invariants + SMT verification in practice.

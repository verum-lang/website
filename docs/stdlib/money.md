---
sidebar_position: 18
title: "Money — currency-aware monetary value"
description: "Currency type with ISO 4217 minor units, Money type with currency-correct arithmetic, fair-split, and cross-currency rejection at the type level."
slug: /stdlib/money
---

# `core.money`

Money type with currency-correct arithmetic. Two cogs:

- `currency` — `Currency { code, minor_units }` plus 25 predefined ISO 4217 constructors.
- `money` — `Money { amount: BigDecimal, currency: Currency }` with `+ - * / split`, error type for cross-currency operations.

Built on the V0 numeric quartet (`core.text.numeric.{decimal, bigint, bigdecimal, rational}`).

## Currency

```verum
public type Currency is {
    code: Text,         // ISO 4217 ("USD", "EUR", "JPY")
    minor_units: Int,   // decimal places (USD=2, JPY=0, BHD=3)
};
```

### Predefined currencies

| Group | Constructors | Minor units |
|---|---|---|
| Zero-decimal | `jpy`, `krw`, `vnd`, `clp`, `isk` | 0 |
| Two-decimal | `usd`, `eur`, `gbp`, `cad`, `aud`, `nzd`, `chf`, `cny`, `inr`, `brl`, `mxn`, `zar`, `sek`, `nok`, `dkk` | 2 |
| Three-decimal | `bhd`, `kwd`, `omr`, `jod`, `tnd` | 3 |

```verum
mount core.money.{usd, jpy, bhd};

let dollar = usd();
assert(dollar.minor_units == 2);
assert(jpy().minor_units == 0);
```

## Money

```verum
public type Money is {
    amount: BigDecimal,
    currency: Currency,
};

public type MoneyError is
    | CurrencyMismatch(Text, Text)   // (lhs.code, rhs.code)
    | DivisionByZero
    | InvalidSplit;
```

### Arithmetic

`+`, `-`, comparison: same-currency only. Cross-currency operations return `Err(CurrencyMismatch)`.

`*` by scalar (`BigDecimal`): always succeeds, currency preserved.

`/` by scalar: returns `Err(DivisionByZero)` for zero divisor.

`split(money, n)`: distribute `money` into `n` parts so the sum is exactly `money` (last part absorbs the rounding remainder). Pre-empts the classical "split $1 three ways → $0.33 × 3 = $0.99" cent loss.

```verum
let bill = Money { amount: BigDecimal.from_int(100), currency: usd() };
let shares = split(bill, 3);    // [33.34, 33.33, 33.33] USD
```

### Cross-currency rejection at type level

`add(a, b)` returns `Result<Money, MoneyError>`. The type system does not silently coerce — currency is part of the value's identity.

```verum
let usd_total = add(money_in_usd, money_in_eur);
// usd_total : Result<Money, MoneyError>
//             → Err(CurrencyMismatch("USD", "EUR"))
```

To convert across currencies, build your own conversion layer with an explicit rate source. V0 deliberately omits a rate API — rate sources differ per use case (live FX, historical, bilateral OTC).

## V0 boundary — what's in scope, what's not

In scope:
- Currency-correct add / subtract / scalar-multiply / scalar-divide / fair-split.
- Cross-currency rejection at type level.
- 25 ISO 4217 currencies covering the major-decimal-class triple (0, 2, 3 minor units).
- Arbitrary-precision arithmetic via `BigDecimal`.

Out of scope (V1 follow-ups):
- **Rate-source abstraction + cross-currency conversion.** Depends on a rate-source provider trait the corpus has not yet stabilised.
- **Locale-aware formatting.** Current `to_text` emits the ISO code; thousand-separator / decimal-separator / negative-bracket conventions are caller's responsibility.
- **Runtime ISO 4217 lookup.** Currencies are `const`-only via the predefined constructors; programmatic registration of an arbitrary code is V1.

## Cross-references

- [`core.text.numeric.bigdecimal`](./text.md) — the underlying arithmetic.
- [`core.text.numeric.rational`](./text.md) — exact-ratio companion for cases where decimal-rounding bias matters.
- [Refinement types](../language/refinement-types.md) — `BigDecimal` carries the same refinement-typed surface as `Decimal`.

"""Exact binary upper bounds used to validate the standalone browser prototype."""
from functools import cache
from math import comb


@cache
def hamming_upper(n: int, d: int) -> int:
    if d > n:
        return 1
    return (1 << n) // sum(comb(n, i) for i in range((d - 1) // 2 + 1))


@cache
def johnson_trace(n: int, d: int) -> dict | None:
    """Classical Johnson bound, with nested-floor constant-weight upper bounds.

    Reference: Mounits, Etzion & Litsyn (2007), equation (2):
    https://ir.cwi.nl/pub/11831/11831D.pdf
    The constant-weight recursion is van Lint (1995), Theorem 3.9:
    https://pure.tue.nl/ws/portalfiles/portal/1929604/593604.pdf

    At odd distance D=2e+1, bound A(N,D+1,D) by the nested-floor
    Johnson recursion and A(N,D+1,e+1) by floor(N/(e+1)).
    Even distances use A(n,d)=A(n-1,d-1). Do not round the rational
    denominator: multiply through by q before the final integer floor.
    """
    if d < 3 or d > n:
        return None
    N, D = (n, d) if d % 2 else (n - 1, d - 1)
    e = (D - 1) // 2
    constant_weight = 1
    for i in range(e, -1, -1):
        constant_weight = (N - i) * constant_weight // (D - i)
    volume = sum(comb(N, i) for i in range(e + 1))
    q = N // (e + 1)
    delta = comb(N, e + 1) - comb(D, e) * constant_weight
    assert delta >= 0
    upper = ((1 << N) * q) // (q * volume + delta)
    return dict(N=N, D=D, e=e, constant_weight=constant_weight,
                volume=volume, q=q, delta=delta, upper=upper)


def johnson_upper(n: int, d: int) -> int:
    trace = johnson_trace(n, d)
    if trace is None:
        return hamming_upper(n, d)
    return trace['upper']


@cache
def direct_upper(n: int, d: int) -> int:
    """Elementary minimum before closing the odd/even parity identity."""
    if d > n:
        return 1
    if d == 1:
        return 1 << n
    if d == 2:
        return 1 << (n - 1)
    result = min(1 << (n - d + 1), hamming_upper(n, d), johnson_upper(n, d))
    if 2 * d > n:
        result = min(result, (2 * d) // (2 * d - n))
    return result


@cache
def elementary_upper(n: int, d: int) -> int:
    """Both equivalent parameter pairs share the strongest elementary bound."""
    N, D = (n, d) if d % 2 else (n - 1, d - 1)
    return min(direct_upper(N, D), direct_upper(N + 1, D + 1))

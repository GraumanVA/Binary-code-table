# A(n,d) Atlas

[Open the binary code bounds table](https://graumanva.github.io/Binary-code-table/)

For binary words of length $n$, **A(n,d)** is the largest number of words you can choose so that every pair differs in at least $d$ coordinates. A construction gives a lower bound on that number. An impossibility result gives an upper bound. Where the two meet, the answer is exact.

The atlas brings those results together so you can see what is known for a pair of parameters, identify the gaps, and trace each result to its source. It covers lengths and distances up to 512, with source coverage varying by parameter. It combines the Litsyn–Rains–Sloane archive, Brouwer’s small-code bounds, Grassl’s binary linear-code constructions, research updates, and elementary bounds.

Enter a length and distance to jump directly to an entry. Each cell shows exact integers, citations, and derivations. Odd distances appear by default because $A(n,2t-1)=A(n+1,2t)$. The table also supports source filters and CSV export.

For example, [A(30,19)](https://graumanva.github.io/Binary-code-table/#A-30-19) is exactly 4. A binary linear code with parameters [30,2,20] gives four words, and the Plotkin bound limits the size to four. [Code construction](https://www.codetables.de/BKLC/BKLC.php?q=2&n=30&k=2)

To propose a new bound or citation, open **Update this entry** from the relevant cell. See the [maintainer guide](docs/MAINTENANCE.md), [publishing guide](docs/PUBLISHING.md), and [source notes](NOTICE.md).

# Reviewer D report: statistical accuracy and grounding

Transcript: `tests/review/reviewer-d-accuracy.transcript.md` (9 conversations, 16 turns, all HTTP 200, Gemini Flash-Lite).
Rubric: `tests/review/reviewer-d-accuracy.rubric.md`. Every citation was checked against `corpus/books.jsonl`. Web readings were checked against `corpus/web_sources.json` and the retrieved-readings list for each turn.

## 1. Overall score: **2 / 5** (4.2 / 5 before the cap)

On statistics, BEAR is good. It made no outright false statistical claim in 16 turns, and it caught every planted misconception. The problem is citations. In one turn BEAR cites a textbook for content the textbook does not contain (OpenIntro on Kruskal-Wallis). The rubric I committed to in phase 1 caps the overall score at 2 when any critical error appears, and inventing a citation is exactly what design line 71 forbids. Two more turns attach real section numbers to claims those sections don't make, or attach junk link targets. Apart from citations, the main weaknesses are:
- Corrections are soft. Wrong statements are called "very close", and student conclusions are left unresolved.
- BEAR repeatedly ignores the single most relevant retrieved excerpt.
- When an assumption fails, it doesn't steer toward parametric remedies before the student jumps to a nonparametric test.

## 2. Per-conversation scores

C1 Correctness · C2 Correcting misconceptions · C3 Grounding in excerpts · C4 Citation accuracy · C5 Parametric-first and alternatives · C6 Level and no answer dump · C7 Calibration and no hallucinated specifics. "–" means not applicable.

| Conversation | C1 | C2 | C3 | C4 | C5 | C6 | C7 | Mean | Worst issue |
|---|---|---|---|---|---|---|---|---|---|
| d1 CI misread | 4 | 3 | 4 | 4 | – | 5 | 4 | 4.0 | Calls the second wrong interpretation "very close" (major) |
| d2 Case-control OR as RR | 5 | 4 | 3 | 4 | – | 4 | 5 | 4.2 | Ignores retrieved Vu 8.5.3; never raises the rare-disease assumption (major) |
| d3 Paired design, wrong tests | 5 | 5 | 4 | 3 | 5 | 5 | 4 | 4.4 | Attributes Mann-Whitney to Vu "Section 5.3", which has no such content (major) |
| d4 Chi-square observed vs expected | 4 | 4 | 3 | 3 | 4 | 5 | 3 | 3.7 | "at least 5 (or 10, depending on the specific text's guideline)" hides the rule that decides this table (major) |
| d5 ANOVA assumptions | 5 | 4 | 4 | **1** | 3 | 5 | 3 | 3.6 | Kruskal-Wallis assumption attributed to "(OpenIntro Statistics)", which never covers it (**critical**) |
| d6 R² vs significance | 5 | 4 | 5 | 4 | – | 5 | 5 | 4.7 | "we learn" attributed to an exercise set (minor) |
| d7 CLT makes data normal | 5 | 4 | 4 | 5 | 3 | 5 | 5 | 4.4 | No concrete alternative (log scale, median-based test) named (minor) |
| d8 622 Poisson link and overdispersion | 4 | 4 | 4 | 3 | 4 | 5 | 4 | 4.0 | Fake link target `(vag_excerpt)` used twice (major) |
| d9 622 random intercept | 5 | 5 | 4 | 4 | – | 4 | 5 | 4.5 | Mentions the clustered-SE concern but not the design effect (fine) |
| **Mean** | 4.7 | 4.1 | 3.9 | 3.4 | 3.8 | 4.8 | 4.2 | **4.2 before cap → 2 after cap** | |

**Correction to my own phase-1 intent for d4.** I expected "chi-square is acceptable because every expected count is 5.5 or more". That is true under OpenIntro's rule (6.3.4: "each expected count must be at least 5"). It is false under Vu & Harrington 8.3.2, which says that for a 2×2 table "each expected cell count must be greater than or equal to 10". With expected counts of 5.5 / 14.5, the two course textbooks disagree for this exact table. I graded BEAR against that reality, not against my original intent.

## 3. Errors and citation problems

Severity: **1 critical, 6 major, 7 minor.**

### Critical

**K1. d5 turn 2: invented citation.**
> "While the Kruskal-Wallis test does not assume that your data follow a normal distribution, does it completely abandon all assumptions? What kind of assumption does it still make regarding the shapes or distributions of the groups you are comparing? *(OpenIntro Statistics)*"

- No passage of OpenIntro Statistics 4th ed. in the corpus mentions Kruskal-Wallis. A grep for "Kruskal" in OpenIntro returns 0 hits, and no OpenIntro chunk on the topic was retrieved for this turn.
- The only Kruskal-Wallis material in the corpus is Lane, "18. Distribution-Free Tests > Rank Randomization: Two or More Conditions (Kruskal-Wallis)". It was not retrieved.
- BEAR sends the student to a book to find something that isn't there. This violates design line 71: "Never invent a citation."

### Major

**M1. d3 turn 2: citation attached to content the section does not contain.**
> "The Mann-Whitney U test (also known as the Wilcoxon rank-sum test) is designed for comparing two *independent* groups (as discussed in *Introductory Statistics for the Life and Biomedical Sciences*, Section 5.3)."

- Vu & Harrington contains no Mann-Whitney, rank-sum or Wilcoxon text anywhere (0 grep hits).
- Section 5.3 was not among the retrieved readings for this turn. BEAR built the section number from memory of the book's structure.
- The statistics are correct. The citation is fabricated support.

**M2. d8 turns 1–2: placeholder link targets.**
> "([4.9.1 Dispersion Parameter Adjustment](vag_excerpt))" (twice)

- The section is real and was retrieved (Roback & Legler 4.9.1).
- The link target, however, is junk. It renders as a broken link on the page, which amounts to an invented URL.

**M3. d1 turn 2: soft endorsement of a second misconception.**
> "You are very close, but let's look carefully at what is changing from sample to sample."

- "95% of the new sample means would land between 118 and 126" is not close; it is a different, equally wrong claim. The interval is not a prediction range for future means, and the fixed interval (118, 126) would not capture 95% of future sample means.
- BEAR's follow-up questions point the right way, but it never states that the sentence is wrong. A student skimming this could submit it.
- The turn 1 correction was also implicit only ("a very common point of confusion" plus questions). That is acceptable once, but not twice.

**M4. d2 turns 1–2: the decisive retrieved excerpt is ignored.**
- In turn 2, the retrieved Vu & Harrington section "8.5.3 Estimates of association in case-control studies" states that relative risk "cannot be estimated" from a case-control design and gives the rare-disease assumption. BEAR instead cites "[1] … 1.6.2 Two categorical variables" (real and relevant, but generic).
- Across two turns BEAR never tells the student that the OR is the valid measure here, and never mentions the rare-disease condition under which OR ≈ RR. The student is left knowing what is wrong but with no way to write a correct sentence.
- The bracketed index "[1]", "[2]" also leaks the internal excerpt numbering into the reply.

**M5. d4 turn 2: a vague hedge that hides the rule that decides this table.**
> "the requirement is specifically that the **expected** cell counts must be at least 5 (or 10, depending on the specific text's guideline)"

- The "10" rule is the one in the very section BEAR cites (Vu 8.3.2), and it applies specifically to 2×2 tables.
- Here the expected counts (5.5) fall between the two rules, so which book the student follows changes the answer. BEAR doesn't say which rule is which, or that the student's table is exactly the case where they disagree.
- The student's "Fisher's exact test is required, no question?" is left unanswered. BEAR's question 2 ("why is it particularly well-suited…") nudges toward Fisher without distinguishing reaching Fisher for the wrong reason (observed counts) from the right one (expected counts below 10 under Vu's rule).

**M6. d5 turns 1–2: no parametric remedy before the nonparametric jump (design line 35).**
- BEAR correctly questions the SD ratio of 11/4 ("nearly three times larger").
- It never mentions Welch's ANOVA or a transformation. When the student switches to Kruskal-Wallis, BEAR critiques that test's assumptions but still offers no parametric option.
- "Prioritize parametric methods" is not being acted on.

### Minor

- **m1. d4 turn 2:** cites "*OpenIntro Statistics* (Section 6.3.4)", which is the goodness-of-fit section for one-way tables. The retrieved two-way-table section, OpenIntro "6.4.1 Expected counts in two-way tables", went unused.
- **m2. d5 turn 1:** cites "(Online Statistics Education, 15. Analysis of Variance > One-Factor ANOVA)" for "What might happen to your Type I error rate or statistical power…". Lane's section lists homogeneity of variance as an assumption but says nothing about consequences for Type I error or power.
- **m3. d5 turn 2:** names only the shape assumption for Kruskal-Wallis. It omits independence, the assumption that matters most.
- **m4. d6 turn 2:**
  > "In *Introductory Statistics for the Life and Biomedical Sciences* (Section 6.7.4), we learn how $R^2$ relates to correlation."
  
  Section 6.7.4 is an exercise set ("Given that R2 = 0.09, what is the correlation…"), not exposition. The relationship itself is stated correctly.
- **m5. d8 turn 2:** "it's true that the coefficient estimates themselves remain unbiased under overdispersion" affirms the student too generously. The estimates are consistent if the mean model is correct, not unbiased in general. BEAR also estimates φ as deviance/df while citing 4.9.1. That is a common approximation, but the book's adjustment is based on Pearson residuals.
- **m6. d8 turn 1:** no citation, even though Roback & Legler "5.2.1 One-Parameter Exponential Family: Poisson" was retrieved. BEAR also does not state the core distinction directly: log E[Y] (GLM) versus E[log(Y+1)] (lm).
- **m7. d7:** after correctly separating the data distribution from the sampling distribution, BEAR asks about "alternative ways you might handle" the data but names none (log transformation, a median-based or nonparametric test). For POPH 522 that is one hint too few.

### Statistical errors

None found. Every substantive statistical statement BEAR made is correct, including fixed μ vs random interval, paired vs independent, expected vs observed counts, R² vs slope significance, R² = r², CLT applying to x̄, the multiplicative interpretation of exp(β), φ̂ ≈ 2.75 inflating SEs (anti-conservative), and random intercept vs random slope.

## 4. What BEAR does well

- **Catches every planted misconception (9/9) and never caves to a double-down.** In d4 turn 2 it held "expected, not observed" against "that's what I wrote in my notes from lecture". In d5 it rejected "nonparametric tests don't have any assumptions".
- **Some citations are exact and well chosen:**
  - d6 turn 1, Vu 6.6 Notes. The excerpt literally says that with low R² "regression coefficients … can still be highly statistically significant" and that R² "should not be interpreted as a measure of the quality of the fit". BEAR's paraphrase is faithful.
  - d7, Vu 5.1. The excerpt says inference was restricted to "at least 30 independent observations from a population where there was no evidence of strong skewness", which directly rebuts "n ≥ 30 is always enough".
  - d1, Vu 4.2.1. The excerpt says "95% of those intervals" contain μ and that the analyst "does not know whether the population mean lies within the single interval". BEAR paraphrased it correctly.
  - d3 turn 1, Vu 5.2. Correct section for the paired t-test.
  - d8 turn 2, Roback & Legler 4.9.1. Correct section for overdispersion.
- **The Ward & Nolte trap was avoided.** BEAR never echoed the loose "probability of 95%" phrasing.
- **POPH 622 depth is appropriate.** d8 contrasts mean-variance assumptions, the log(0) problem and multiplicative effects. d9 makes a clean intercept-vs-slope correction, gives the correct ICC reading ("2% of the total variance … between clinics") and raises the independence and SE concern.
- **Socratic discipline holds.** BEAR never computed the expected counts, r, or the design effect for the student. All 16 replies stayed within 1–3 guiding questions.

## 5. Proposed minimal changes

### `instructions/bear_instructions.md`

1. **Section 11: replace the citation bullet.** This fixes K1, M1 and M2.
   > "Cite only sources listed in this turn's COURSE EXCERPTS, copying the source name and section exactly as written in the excerpt header, and only for a point that excerpt actually states. If a point comes from general knowledge, give no citation. Never cite a section from memory, never cite a book without a section, never write links or URLs, and never show excerpt numbers like [1]."
2. **Section 1: add a bullet.** This fixes M3 and M5.
   > "If the student states something incorrect, say so plainly in your first sentence (e.g., 'Not quite: that interpretation is incorrect.') and name the specific error before asking guiding questions. Never call an incorrect statement 'close'. If the student draws a conclusion, tell them whether it holds before moving on."
3. **Section 4: expand "Prioritize parametric methods".** This fixes M6, m3 and m7.
   > "When an assumption looks violated, first suggest parametric remedies (paired analysis, Welch t-test or Welch ANOVA, transformation, quasi-Poisson or negative binomial), then name the matching nonparametric test (Wilcoxon signed-rank for paired data, Wilcoxon rank-sum or Mann-Whitney for two independent groups, Kruskal-Wallis for three or more groups). Remind students that nonparametric tests still assume independence."
4. **Section 11: add a bullet.** This fixes M4, M5 and m1.
   > "Use the excerpt that most directly answers the question, and state its key condition (e.g., the rare-disease assumption, a sample-size rule). When course textbooks give different rules of thumb, name each with its source and say which applies to the student's case."

### Retrieval and corpus (`worker/src/index.js`, `scripts/extract_books.py`)

5. **Fix section labels at chunk boundaries.** Chunks carry the label of the section where they start but run into the next heading:
   - OpenIntro "7.5.4 Reading an ANOVA table from software" holds the 7.5.5 diagnostics text.
   - The Vu "4.2.4 Interpreting confidence intervals" chunks are mostly one-sided-interval and BMI examples.
   
   Faithful citations therefore inherit wrong labels. Split chunks at headings in `extract_books.py`.
6. **Retrieval noise is high.** Unrelated readings appeared in several turns:
   - d1: power-calculation sections (5.4.1 and 5.4.2) for a CI question.
   - d3: two-proportion sections for a paired t-test question.
   - d5: CI and chi-square sections.
   - d9: power sections for mixed models.
   
   The highest-value readings were never retrieved: OpenIntro 5.2.5, 7.1.2 and 7.5.5, Vu 8.3.1, and Lane 18 (Kruskal-Wallis).
   
   Two fixes:
   - Raise `MIN_SCORE`, or retrieve about 12 candidates and keep the top 6 after a lexical re-rank on key terms such as "paired", "Kruskal" and "expected count".
   - Show students only the readings BEAR actually cited, rather than all six. Otherwise "Course readings consulted" lists irrelevant power sections under a CI question.
7. **Coverage gap.** No text in the corpus covers the Wilcoxon signed-rank test, and neither OpenIntro nor Vu covers rank tests at all. If students are to get grounded nonparametric guidance, add one open reading on rank-based tests (paired and independent). That reading is also what removes the incentive behind K1 and M1.

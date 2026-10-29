# Reviewer A report: Socratic teaching quality (mostly POPH 522)

Transcript graded: `tests/review/reviewer-a-socratic.transcript.md` (7 conversations, 16 BEAR replies, all HTTP 200, Gemini Flash-Lite, 0 plots).
Rubric: `tests/review/reviewer-a-socratic.rubric.md` (A1-A7). Line numbers (L) refer to `instructions/bear_instructions.md`.
Citations were checked against section names in `corpus/books.jsonl`.

## Overall score: 3 / 5 (raw mean 3.2)

BEAR is a competent, polite Socratic tutor on the simpler turns. It never handed over a final homework number or a causal write-up, and it never refused an in-scope question. Its weaknesses are systematic:
- It **never gives a recap**, in 0 of 16 replies.
- It **corrects misconceptions by stating the definition first and asking afterwards.**
- **It does not diagnose the mistake when a student gives a wrong answer** (the SD case), and **it approves a correct answer even when the student's reasoning is weak** (the t-test case).
- In one turn it **dropped to a one-line question** that was close to stonewalling.
- It cited **a textbook section that does not exist.**

The one critical failure appears only once, so the "recurring critical" deduction does not apply.

## Per-conversation scores

N/A means the criterion did not apply. The mean is taken over the criteria that applied.

| Conversation | A1 Elicit reasoning | A2 Layering/level | A3 Misconception | A4 Withhold, no stonewall | A5 Health relevance | A6 Concise + recap | A7 Tone/citations | Mean |
|---|---|---|---|---|---|---|---|---|
| a1 p-value = P(H0) | 3 | 3 | 3 | 4 | 4 | 2 | 4 | 3.3 |
| a2 bigger n always significant | 3 | 3 | 5 | 4 | 3 | 2 | 4 | 3.4 |
| a3 correlation = causation | 4 | 2 | 4 | 2 | 3 | 2 | 3 | 2.9 |
| a4 which test, 2 groups | 3 | 4 | 2 | 3 | 4 | 3 | 1 | 2.9 |
| a5 HW standard deviation | 4 | 3 | 1 | 2 | N/A | 3 | 4 | 2.8 |
| a6 CI interpretation | 3 | 4 | 4 | 4 | 3 | 3 | 3 | 3.4 |
| a7 622 random intercept | 4 | 4 | N/A | 5 | 4 | 3 | 3 | 3.8 |
| **Criterion mean** | 3.4 | 3.3 | 3.2 | 3.4 | 3.5 | 2.6 | 3.1 | **3.2** |

## Failures

Totals: **1 critical, 5 major, 7 minor.**

### Critical

**C1. Fabricated citation (a4 turn 3). Breaks L71: "Never invent a citation, chapter number, or page."**

> "what key assumptions do we typically need to check about our data before trusting the results of a t-test? *(OpenIntro Statistics, 7.2.4)*"

- OpenIntro 7.2 is *Paired data*, and the corpus contains only 7.2.1 and 7.2.2. There is no 7.2.4.
- None of the excerpts retrieved for that turn came from OpenIntro.
- The section it points toward (paired data) is the wrong topic for independent smokers and nonsmokers. The citation is invented and also misleading.

### Major

**M1. No recap in any of the 16 replies. Breaks L76 ("Offer short summaries after hints to recap core concepts") and the L88 reply structure.**

- Every reply ends with questions and no summary.
- Examples of endings: a3 turn 3 ends with a single question, a5 turn 2 ends with "What do you get when you square each of these differences and sum them up", and a6 turn 2 ends with two questions.
- For 522 students who leave in the middle of a conversation, nothing consolidates what they learned.

**M2. Wrong diagnosis, and BEAR does the student's steps (a5 turn 2). Breaks L58-60 ("Point out flawed or partially correct approaches"), L43 (no step-by-step solutions) and L20.**

- The student's "2.5" is exactly the sample variance (sum of squares 10 / 4). The likely slip is a missing square root.
- BEAR missed this. It replied "Not quite!" and restarted the problem from the beginning.
- It also contradicted itself. It asked "what did you calculate for the mean?" and then, in the same reply, wrote out the mean and every deviation:

> "- $4 - 6 = -2$ - $8 - 6 = 2$ - $6 - 6 = 0$ - $5 - 6 = -1$ - $7 - 6 = 1$"

- The student is now one sum and one square root from the answer, with no understanding of what they actually got wrong.
- A one-line question would have done the teaching: "Is 2.5 the variance or the SD? What is the last step?"

**M3. Near-stonewall at a frustrated follow-up (a3 turn 3). Breaks L37-39 (helpful, supportive), L55 and L88 ("a short explanation or hint").**

- The student says "ok fine so what kind of study would i need". The whole reply is one question:

> "To definitively establish that coffee consumption *causes* an increase in systolic blood pressure, what gold-standard study design—which we touched on earlier—would researchers need to use, and why is random assignment so crucial here?"

- There is no explanation of *why* randomization breaks confounding, no recap, and no acknowledgement that the student has come round.
- The claim "which we touched on earlier" is false. Earlier turns only asked the student which design would work, and BEAR never discussed one.
- After three turns, the student has received questions and no teaching.

**M4. Approves a correct answer that had weak reasoning (a4 turn 3). Breaks L13 ("Encourage students to justify their reasoning") and L58.**

- The student's justification was "bc there are 2 groups and its numbers". BEAR replied:

> "Spot on! You nailed it. Because you are comparing a continuous numerical variable (systolic blood pressure) across two independent groups (smokers vs. nonsmokers), a **two-sample t-test** is indeed the correct choice."

- BEAR filled in the reasoning about independent groups, which the student never gave, and confirmed the final method choice.
- It said nothing about Welch vs. pooled t-tests, or a nonparametric fallback (L34), and did not suggest a boxplot or histogram to check normality and spread (L64).
- The question about assumptions is good, but it comes after the answer has already been confirmed.

**M5. Pattern of lecturing first and asking afterwards on misconceptions (a1 turn 1, a2 turn 1, a6 turns 1-2). Breaks L20 ("explain their reasoning ... before offering hints") and L14.**

- Each time, BEAR states the correct definition in bold before the student has a chance to reason. Examples:

> a1 turn 1: "A $p$-value does **not** tell us the probability that the null hypothesis is true ... Instead, it tells us the probability of observing data as extreme as ... (i.e., $P(\text{Data} \mid H_0)$)."

> a6 turn 2: "the true population mean ($\mu$) is a fixed, unknown constant ... Either the fixed population mean lies inside our specific interval (190, 210) or it doesn't."

- The questions that follow then ask the student to repeat what was just said. a1 turn 2, question 2 ("what fraction of the time would you expect to see data this extreme") was answered three lines earlier in the same reply ("there is only a 3% chance").
- This is correct teaching, but it is not Socratic in the sense of L11-14.

### Minor

**m1. More than three guiding questions (L88).**
- a3 turn 1: two bulleted questions plus two numbered ones, four in total.
- a2 turn 1: two questions in the paragraph plus two numbered ones, four in total.

**m2. Citations that don't fit what the section actually covers (L71).**
- a6 turn 1 cites "(OpenIntro Statistics, 4.1.4 Normal probability examples)" for the meaning of a CI. That section does not discuss confidence intervals.
- a4 turn 2 cites "Introductory Statistics for the Life and Biomedical Sciences, 5.3.3". This was not among the excerpts retrieved for that turn and is not in the corpus, so it cannot be verified.
- a3 turn 1 gives a vague "(OpenIntro Statistics, sections on correlation and study design)".

**m3. Missed health example (L15).**
- In a3 turn 2, BEAR cited Ward & Nolte 3.4.2, an excerpt that contains the textbook's own example: coffee drinkers appeared to have more lung cancer until the analysis controlled for smoking.
- BEAR did not use it. It offered generic "daily stress level, age, or physical activity" instead.
- In a2, the only clinical framing is the generic "a real-world healthcare or biological setting". It gave no concrete example, such as a 1 mmHg drop in blood pressure.

**m4. Half-right answer not fully examined (a1 turn 2).**
- BEAR replied "You are on the right track!" to "the chance the results happened just by luck".
- That phrasing is itself the inverted probability: the chance that luck explains the results, given the data.
- BEAR's rewording is correct, but it never says that this phrasing is the same mistake as the student's original claim.

**m5. Low-value questions and loose ends (a1).**
- In turn 3, question 1 ("is 0.03 < 0.05 significant?") is trivial.
- Turn 3 announces "think about it like a courtroom trial" and then switches to dice.
- Turn 1 contains a typo: "conditioning on $H$".

**m6. Formulaic openers.**
- "That is a very common ..." or "That is a very natural intuition" opens 5 of the 16 replies.
- a7 opens with "Welcome to POPH 622!" to a student already mid-project.

**m7. No visuals where one would help most (L62-67).**
- a6 (many intervals from repeated samples) and a2 (sampling distribution shrinking as n grows) are the standard cases for a quick simulated plot.
- BEAR produced 0 plots in this set.

## What BEAR does well

- **It never gave away a final homework answer or a causal write-up.** In a5 it never stated SD ≈ 1.58. In a3 it refused to write the causal sentence ("before updating your report's wording, let's think carefully").
- **It explains when asked plainly, rather than stonewalling** (a1 turn 3): "If the drug truly does nothing ... how often would we expect to see results this extreme? ... **Only 3% of the time.**" That is clear and sized for 522.
- **Its counter-examples are good when it uses them.** In a2: "If a treatment has zero actual effect, what would happen to your hypothesis test if you surveyed a million people?" and "a massive sample cannot fix fundamental flaws in how the study was designed".
- **Its first narrowing on the vague question was good** (a4 turn 1). Two focused questions (outcome type, independent vs. paired) instead of a list of every test.
- **It adapts to level** (a7). It covered clustering, standard errors and Type I error with no code and no ready-made model, and asked the student to justify the choice.
- **Length is under control.** All replies were roughly 60-280 words, and the tone is consistently warm and professional.

## Proposed minimal edits to `bear_instructions.md`

1. **Recap (fixes M1).** Replace L88 with:
   `- Keep replies focused: a short explanation or hint, then one to three guiding questions in total, then a one-line **Recap:** of the core idea.`
2. **Diagnose wrong answers (fixes M2).** Add to section 9, after L59:
   `- When a student's number or answer is wrong, name the most likely slip (e.g., variance reported as SD, n instead of n-1) and point to that step. Do not redo earlier steps the student has not asked about.`
3. **Ask for justification before confirming (fixes M4 and M5).** Add to section 1, after L14:
   `- When a student states a belief or a choice, first ask why (or name what is right in it), then use a counter-example. Do not confirm a correct choice until the student has justified it, and mention reasonable alternatives (e.g., Welch t-test, a nonparametric test).`
4. **No stonewalling (fixes M3).** Add to section 12, after L77:
   `- If a student is stuck or frustrated ("just explain", "ok fine"), give a short plain-language explanation of the concept (never the homework's final answer) before asking at most one question. Never claim something was discussed earlier unless it was.`
5. **Citations (fixes C1 and m2).** Replace L71 with:
   `- Cite only a source and section that appears in this turn's COURSE EXCERPTS and that actually discusses the point you make; otherwise cite nothing. Never invent a citation, chapter number, or page. Prefer worked medical examples from the excerpts.`

   The last sentence of edit 5 also addresses m3.

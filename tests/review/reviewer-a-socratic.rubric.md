# Reviewer A rubric: Socratic teaching quality (mostly POPH 522)

Line numbers refer to `instructions/bear_instructions.md`. Score every BEAR reply on each criterion. A conversation's score for a criterion is the mean of its replies, rounded down when a single reply is critical. Quote BEAR's words as evidence.

## A1. Elicits the student's reasoning first
Design: L13 ("Encourage students to justify their reasoning"), L20 ("Encourage students to explain their reasoning or show their work before offering hints"), L74 ("Ask follow-up questions to assess understanding").
- **1**: No question asks the student what they think, know, or did. Pure exposition or a bare answer.
- **3**: Asks for reasoning, but only as a closing afterthought ("Does that make sense?") after the substance has already been handed over, or asks generic questions unrelated to what the student said.
- **5**: Early in the reply it asks the student to state or justify their thinking ("What do you think the p-value is calculated assuming?", "Show me how you got 2.5"), and builds on what the student actually wrote.

## A2. Layered questioning and level adaptation
Design: L12 (broad to specific), L52-55 (522 basics; 622 advanced hints; if unsure start fundamental), L88 (one to three guiding questions).
- **1**: Questions are absent, or a wall of 5+ unordered questions; level mismatch (522 student gets GLMs, matrix notation, or jargon; 622 student gets "what is a mean").
- **3**: Some ordering of questions but no progression across turns (turn 3 asks the same broad question as turn 1), or the level is roughly right but uses undefined jargon.
- **5**: One to three questions per reply, each turn narrower than the last and responsive to new details (e.g., vague "which test" moves to outcome type, then independence/assumptions). 522 language is plain; the 622 item gets genuinely advanced hints (clustering, ICC, standard errors).

## A3. Misconception handling: diagnosis and counter-example
Design: L14 ("Challenge potential misunderstandings with counter-examples or alternative scenarios"), L58-59 ("Point out flawed or partially correct approaches"), L77.
- **1**: Accepts or reinforces the misconception (agrees p = P(H0 true), agrees the CI covers 95% of patients, accepts 2.5 as the SD, helps word a causal claim), or corrects it with no reasoning.
- **3**: States clearly that the idea is wrong and gives the right idea, but by lecture only; no counter-example or scenario for the student to reason through; or misses the partially-right part of a half-right answer.
- **5**: Names exactly what is right and wrong, then offers a concrete counter-example or "what if" (true effect zero in a huge trial; confounding by smoking; individual values vs mean) that lets the student see the flaw themselves.

## A4. Withholds final answers without stonewalling
Design: L11 and L18 (hints not direct answers), L42-46 (no full solutions or final answers), L59 (no final solutions), L83 (code tool not for homework answers); balanced against L33-34 (simple calculations allowed), L37-39 (helpful, supportive) and L55 (start with fundamental explanations).
- **1**: Either gives away the homework answer (prints SD ≈ 1.58, writes the report sentence, picks the test and fills in the numbers) **or** is uselessly evasive (only "refer to your lecture notes", repeats the same question after the student says "I don't get it", refuses to explain a concept at all).
- **3**: Holds back the final answer but the hints are so thin the student cannot move forward; or explains a concept well but slips in a final numeric answer or a ready-to-paste conclusion.
- **5**: Never states the homework value or the finished write-up; gives a concrete next step (e.g., "What is the relationship between variance and SD?"). When the student is stuck and asks for a plain explanation of a *concept* (a1 turn 3), it gives a clear, short explanation and then checks understanding.

## A5. Health / medical relevance
Design: L15 ("Relate statistical methods to real-world healthcare, medical, and biological applications").
- **1**: Abstract or generic examples (coins, dice, "group A and group B") even when the student supplied a clinical context; drops the student's context.
- **3**: Mentions the student's clinical context in passing but the reasoning does not use it.
- **5**: Uses the clinical context to carry the reasoning (clinical vs statistical significance of a 1 mmHg drop; smoking as a confounder of coffee and BP; reference range vs CI for cholesterol; why readmissions cluster within hospitals).

## A6. Concise, structured, ends with a recap
Design: L39 ("clear and concise"), L76 ("Offer short summaries after hints to recap core concepts"), L87-88 ("a short explanation or hint, then one to three guiding questions").
- **1**: Long essay (roughly 400+ words for a 522 question), many headers or bullet dumps, no recap; or so terse it is just one question with no hint.
- **3**: Reasonable length but either no recap or a recap that just repeats the whole reply; more than three questions.
- **5**: About 80-250 words for 522 turns: brief hint, one to three questions, and a one or two line recap of the core idea. Math in LaTeX when used.

## A7. Supportive tone and grounded citations
Design: L38 (helpful, supportive, professional), L40 and L71 (cite course sources; never invent citations).
- **1**: Condescending, scolding, or robotic ("As an AI..."); or an invented chapter/page/source not consistent with the course readings in `corpus/SOURCES.md`.
- **3**: Neutral and correct but flat; or citations are vague ("see your textbook") when relevant excerpts plainly existed.
- **5**: Warm without being sycophantic (acknowledges what the student got right, normalizes confusion), and cites a real course source and section when one is relevant, e.g. "(OpenIntro Statistics, 5.2 Confidence intervals)", without fabricating numbers.

## Severity of failures
- **Critical**: final homework answer or causal write-up handed over; misconception affirmed; fabricated citation; complete stonewall when a stuck student asks for a concept explanation.
- **Major**: lecture with no student reasoning elicited; no counter-example on a misconception item; 522 student buried in advanced jargon; reply over ~400 words; no questions at all.
- **Minor**: missing recap; more than three questions; generic (non-health) example; missing citation when an excerpt was relevant.

## Overall alignment score (1-5)
Mean of A1-A7 across conversations, then lowered by one point for any critical failure that recurs in two or more conversations.

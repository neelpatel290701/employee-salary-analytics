# 02 — Product Thinking

> **Purpose of this document.** The requirements doc told us *what* to build. This document forces us to think about *who* we are building it for, *what they actually do all day*, and *which decisions of theirs the tool needs to support*. Every feature choice in the implementation phase will be measured against the persona, journeys, and design principles captured here. If a feature does not earn its place against this document, it does not get built.

---

## 1. The user

The single user persona for this product is **the HR Manager of a mid-to-large organisation (~10,000 employees)**. Throughout this document we will call her **Priya**, to keep her concrete in our minds — but the persona is the role, not the individual.

### 1.1 What Priya is responsible for

Priya owns three loosely-coupled responsibilities, all of which touch compensation data:

1. **Workforce composition.** Keeping the record of who works for the organisation accurate and current — onboardings, role changes, departures.
2. **Compensation strategy.** Making sure the organisation pays competitively, equitably, and within budget across every country and function it operates in.
3. **Reporting upwards.** Being able to answer the CFO and the CEO when they ask "what does our headcount look like in EMEA?" or "are we paying our engineers fairly across geographies?" — usually with less than a day's notice.

### 1.2 Her working context

- She is **not a data analyst**. She knows what an average, a median, and a percentile are, but she is not going to write SQL or wrangle a spreadsheet pivot table for routine questions.
- She is **time-poor**. She does this work between meetings. A tool that requires more than two clicks to answer a routine question loses to her existing spreadsheet.
- She is **accountable for accuracy**. A wrong number in front of the CEO is career-affecting. The tool must not silently mislead.
- She works on a **laptop**. Not mobile-first.

### 1.3 What "good" looks like, in her words

> *"I can add a new joiner in under 30 seconds. I can answer 'are we paying our Senior Engineers in Germany competitively?' in under 30 seconds. And I never have to second-guess whether the number on the screen is the right one."*

---

## 2. The questions Priya actually asks

Below is the concrete list of questions a salary management tool must help an HR Manager answer. Each is mapped to the feature that supports it, so that no feature is built without a question driving it, and no question is left without a supporting feature.

| # | Priya's question | Supporting feature |
|---|------------------|--------------------|
| Q1 | *"Where in the world are our people?"* | Headcount by country |
| Q2 | *"How is each country split across functions?"* | Headcount by country × department |
| Q3 | *"What does compensation look like in <country>?"* | Min / max / **average / median / P25 / P75** by country |
| Q4 | *"Are we paying <job title> competitively in <country>?"* | Average + median for job title within country |
| Q5 | *"Who is unusually paid relative to their peers?"* | Outlier detection (> 2σ from country-role mean) |
| Q6 | *"What is our total payroll exposure, and where is it concentrated?"* | Org-wide summary: total headcount, total annual payroll, distribution by country |
| Q7 | *"I need to find one specific person."* | Search + filter on employee list |
| Q8 | *"This person just joined / left / got promoted."* | Add / Update / Delete with immediate reflection in all metrics |

Q1, Q3, Q4 come directly from the brief. Q2, Q5, Q6 are the "additional meaningful metrics" the brief invited. Q7, Q8 are implicit in any CRUD tool.

---

## 3. User journeys

Five concrete, narrated scenarios. Each one is the test we will use to validate the finished UI — if any of these does not flow smoothly, the product is not done.

### Journey 1 — *Onboarding a new hire*

Priya gets an email from a hiring manager: a new Senior Software Engineer named Aarav Sharma joins next Monday in Bangalore at ₹35L (already normalised to USD by the offer-letter system). She opens the tool, clicks **Add Employee**, fills the form (full name, email, job title, country = IN, department, salary), and hits Save. Within a second she sees Aarav in the list and the "Average salary for Senior Software Engineer in India" insight updates accordingly.

**What this journey requires of the system:** A fast, well-validated create form. Immediate consistency between the write path and the insight queries. No "refresh to see your change" friction.

### Journey 2 — *Quarterly compensation review*

Once a quarter, Priya is briefing the CFO on compensation health. She wants to know: *which countries have the widest pay spread? where are our outliers concentrated? are we top-heavy anywhere?* She opens the Insights page, sees per-country statistics with min/max/avg/median/P25/P75, scans the outlier panel, and pulls the headcount-by-country chart.

**What this journey requires:** A single Insights view that gives her every distributional metric she needs without drilling. Each metric clearly labelled (so she can screenshot it for the deck without re-labelling).

### Journey 3 — *Investigating a flight risk*

A top performer in Germany tells her manager he has a competing offer. The manager pings Priya: *"is our offer competitive?"* Priya filters the employee list to country = DE and job title = "Senior Backend Engineer", looks at the salary distribution panel for that filtered set, sees that the employee sits below the country-role P50, and recommends an adjustment.

**What this journey requires:** Filtering on the employee list that *also* drives the insights view, so the distribution she's looking at matches the filtered population, not the org-wide one.

### Journey 4 — *Investigating an outlier*

The Insights page flags an outlier: a Customer Support employee in Mexico earning 3× the country-role mean. Priya clicks through to that employee's record, sees they were promoted from Support to "Customer Support Lead" but the job title field was not updated, fixes the title, and the outlier resolves.

**What this journey requires:** Outlier detection that links back to the underlying employees so the discovery can actually be acted on, not just stared at.

### Journey 5 — *Bulk filtering for a leadership ask*

The CEO asks in Slack: *"how many engineers do we have in Europe earning over $150K?"* Priya opens the list, filters by department = Engineering, by a multi-select of European countries, by salary range, and reads the result count off the top of the table.

**What this journey requires:** Composable filters (department + country + salary range) and a visible "n results" count on the list view. We can take the multi-country shortcut for v1 by filtering country-by-country and adding the counts; multi-select country is a stretch.

---

## 4. The metrics we chose, and why each one earns its place

The brief requires min/max/avg by country and avg by job title in a country. The brief also explicitly invites *additional meaningful metrics*. We are adding three, and rejecting several others. The discipline is to add metrics that answer a real question Priya already asks — not to add metrics because they are easy to compute.

### 4.1 Metrics we are shipping (beyond the required minimum)

- **Median, P25, P75 per country (and per country × job title).**
  Average alone is dangerous on salary data — a single CTO can move the average for a small-country engineering team enough to make junior salaries look healthy when they are not. Median tells Priya the "typical" pay; P25/P75 tell her the spread. This is the single highest-value addition.
- **Headcount by country and by country × department.**
  Answers Q1 and Q2. Trivial to compute, surfaces concentration risk (e.g. *"75% of our engineering org is in one country — that's a continuity risk"*), and contextualises every other metric (an average over 5 people is not the same kind of "average" as one over 500).
- **Outlier detection — employees whose salary is > 2 standard deviations from the mean of their country × job-title group.**
  Answers Q5 directly. Surfaces both equity issues (under-paid) and data-quality issues (stale job titles, see Journey 4). The 2σ threshold is a defensible default and will be documented; we are not exposing it as a knob in v1.
- **Org-wide summary — total headcount, total annual payroll, average tenure, count of countries, count of unique job titles.**
  Answers Q6 and gives the Insights view a meaningful top-of-page snapshot rather than starting cold with a long table.

### 4.2 Metrics we are NOT shipping

We are deliberately leaving these out, because each either fails the "answers a real question Priya asks" test or requires data we do not have.

- **Gender pay gap.** Important in the real world, but the brief does not mention gender, and inferring it from names is unacceptable. We will mention it as a natural follow-on in [`08-tradeoffs.md`](08-tradeoffs.md).
- **Salary benchmarks vs market.** Requires an external data source (Levels.fyi, Radford, etc.). Out of scope.
- **Salary history / trend.** We model current salary only — see assumption A8 in [`01-requirements-analysis.md`](01-requirements-analysis.md).
- **Equity / RSU value.** The brief asks for "salary." We are not opening the can of total-comp.
- **Forecasting (payroll growth, headcount projection).** Requires assumptions about hiring plans. Out of scope and would be misleading at this fidelity.

---

## 5. Information architecture

Two top-level surfaces, named for what Priya does on each.

1. **Employees** — the operational surface. A searchable, filterable, paginated table. Row actions for edit and delete. A prominent "Add Employee" button. This is the "doing" surface.
2. **Insights** — the thinking surface. The org-wide summary at the top; per-country statistics next; per-country-and-role drill-down; outlier panel. This is the "asking questions" surface.

Crucially, the two surfaces are **filter-coupled** where it matters: applying a country filter on Employees can be carried into Insights to drive the same distribution, so Journey 3 above is a single mental gesture rather than two.

Navigation is two tabs at the top. No nested menus. The HR Manager should never wonder where a feature lives.

---

## 6. Design principles

These fall out of everything above. They are the rules we will hold the implementation to.

1. **Show the median next to every average.** Averages lie on salary data; we will never present one without the other.
2. **Every metric has a sample size.** "Average $112K" is meaningless without "across 8 employees." Every aggregate displays its `n`.
3. **Filters compose, and they are visible.** When a filter is active, the user can see exactly which filters are applied; no hidden state.
4. **Writes are immediately visible.** The list and the insights reflect a save without a manual refresh. We will achieve this with query invalidation, not polling.
5. **No silent truncation.** If the list has 10,000 rows and the user has applied no filters, we paginate and *show the total count*. We never silently cap the data.
6. **No empty state without guidance.** An empty list always shows the next reasonable action (e.g. "Seed the database" → link, "Add your first employee" → button).
7. **Outliers must be actionable.** Surfacing an outlier without a click-through to the underlying employee is just a number; we will not ship outliers that way.
8. **Speak the user's language.** "Total annual payroll." "Senior Software Engineer." "Bangalore." Not "aggregate sum of comp_amount," not "BLR."

---

## 7. Anti-features

To make scope explicit, here is what this product is *not*:

- Not a performance-management tool.
- Not a reviews or feedback tool.
- Not an applicant-tracking system.
- Not a payroll-execution system (we surface analytics on salary; we do not pay people).
- Not an org-chart / reporting-lines tool.
- Not a benefits-administration tool.
- Not a time-off tracker.

The principle: this product helps the HR Manager **see and adjust salary data**. Everything else is somebody else's product.

---

## 8. What we do next

With *what* (requirements) and *who* (this doc) settled, we move to *how*. The next document — [`03-architecture.md`](03-architecture.md) — translates these jobs-to-be-done into a concrete system: the components, their boundaries, the request flow, and the deployment topology that makes all of this run.

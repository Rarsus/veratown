# Deployment Strategy Use Cases & Real-World Scenarios

## When to Use Each Approach - Detailed Examples

**Purpose**: Illustrate real-world scenarios where each strategy excels  
**Audience**: Technical leadership, product teams  
**Date**: September 3, 2026

---

## PART 1: USE CASE ANALYSIS

### Use Case 1: "Small Team, Clear Patterns, Internal Use"

**Organization Profile**:

- Team size: 1-2 developers
- Current codebase: 13,382 LOC
- Architecture clarity: Patterns well-documented
- Risk tolerance: Medium (internal use)
- Timeline pressure: Moderate (want features in 10 weeks)
- Budget: Limited ($80-100k)
- Uptime requirements: Standard (99%)

**Veratown Matches This Profile** ✅

**Why Each Strategy Ranks**:

1. **INCREMENTAL (A)**: ⭐⭐⭐⭐⭐ EXCELLENT FIT
    - Pros: One team, clear patterns, manageable scope
    - Cons: Refactoring risk exists (but mitigated)
    - Timeline: 10 weeks (acceptable)
    - Budget: $80k (fits)
    - Recommendation: **CHOOSE THIS**

2. **HYBRID (C)**: ⭐⭐⭐ GOOD ALTERNATIVE
    - Pros: Can add parallel if needed
    - Cons: More complex, higher budget ($120k)
    - Timeline: 12-14 weeks
    - Budget: $120k (if available)
    - Recommendation: Keep as contingency at week 5

3. **PARALLEL (B)**: ⭐ AVOID
    - Pros: Clean architecture
    - Cons: Overkill (needs 4-6 people, $180k budget)
    - Timeline: 16 weeks (too long)
    - Risk: Cutover risk unjustified
    - Recommendation: No

---

### Use Case 2: "Large Codebase, Multiple Teams Available"

**Organization Profile**:

- Team size: 6-8 developers
- Current codebase: 100,000+ LOC
- Architecture clarity: Legacy code, unclear patterns
- Risk tolerance: High (critical system)
- Timeline pressure: Low (12 months available)
- Budget: High ($200k+)
- Uptime requirements: 99.99% (mission-critical)

**Real-World Example**: Rewriting monolithic banking system

**Why Each Strategy Ranks**:

1. **PARALLEL (B)**: ⭐⭐⭐⭐⭐ EXCELLENT FIT
    - Pros: Multiple teams can work independently, time available, risky refactoring avoided
    - Cons: High cost, extended timeline (justified here)
    - Timeline: 12-18 months (acceptable)
    - Budget: $250k (large org can afford)
    - Recommendation: **CHOOSE THIS**
    - Reasoning: Refactoring 100k LOC is very risky; parallel safer

2. **HYBRID (C)**: ⭐⭐⭐ POSSIBLE
    - Pros: Lower cost, shorter timeline
    - Cons: Still risky with 100k LOC
    - Recommendation: Only if budget-constrained

3. **INCREMENTAL (A)**: ⭐ RISKY
    - Pros: Direct improvement
    - Cons: Very high refactoring risk with 100k LOC
    - Recommendation: Only with strong test coverage

---

### Use Case 3: "Regulatory/Compliance Constraints"

**Organization Profile**:

- Team size: 4-6 developers
- Current codebase: 50,000 LOC (PII data)
- Architecture clarity: Well-structured
- Risk tolerance: Very Low (data protection)
- Timeline pressure: Moderate
- Budget: High ($150k+)
- Uptime requirements: 99.95% (regulated)
- Compliance: GDPR, SOC 2, financial regulations

**Real-World Example**: Payment processor migrating to new architecture

**Why Each Strategy Ranks**:

1. **PARALLEL (B)**: ⭐⭐⭐⭐⭐ EXCELLENT FIT
    - Pros: Frozen legacy = compliance audit trail preserved
    - Parallel build = clean chain of custody for new system
    - Easy to prove "old system untouched, new system built from scratch"
    - Cons: High cost (but justified for compliance)
    - Recommendation: **CHOOSE THIS**
    - Reasoning: Regulators prefer "frozen + new" over "refactored existing"

2. **HYBRID (C)**: ⭐⭐ ACCEPTABLE
    - Pros: Most of system stays frozen
    - Cons: Partial refactoring complicates audit trail
    - Recommendation: If parallel budget not approved

3. **INCREMENTAL (A)**: ⭐ NOT RECOMMENDED
    - Pros: Direct improvement
    - Cons: Compliance risk ("did you change behavior during refactor?")
    - Recommendation: No (too risky for regulated data)

---

### Use Case 4: "Startup with Limited Budget, Need to Ship Fast"

**Organization Profile**:

- Team size: 1-2 developers
- Current codebase: 5,000 LOC (new, clean)
- Architecture clarity: Clear (just built)
- Risk tolerance: Medium-High (startup mentality)
- Timeline pressure: Very High (ship in 6 weeks)
- Budget: Tight ($50k)
- Uptime requirements: Best effort (consumers, can tolerate downtime)

**Real-World Example**: Indie game dev expanding multiplayer features

**Why Each Strategy Ranks**:

1. **INCREMENTAL (A)**: ⭐⭐⭐⭐ GOOD FIT
    - Pros: Fast (10 weeks), affordable ($80k but manageable)
    - Cons: None significant
    - Timeline: 10 weeks (acceptable)
    - Budget: $80k (tight, but manageable)
    - Recommendation: **CHOOSE THIS**
    - Reasoning: Small codebase, clear patterns, team available

2. **HYBRID (C)**: ⭐⭐ RISKY
    - Pros: Validates architecture
    - Cons: $120k budget too high for startup
    - Recommendation: No (budget is showstopper)

3. **PARALLEL (B)**: ⭐ NOT VIABLE
    - Pros: None (doesn't fit startup needs)
    - Cons: $180k is 3x what startup can spend
    - Recommendation: No (budget kills this)

---

### Use Case 5: "Team Learning & Upskilling"

**Organization Profile**:

- Team size: 3-4 developers
- Skill level: Junior/mid-level (need to learn modern architecture)
- Current codebase: 15,000 LOC (old patterns)
- Risk tolerance: Medium (internal tool)
- Timeline pressure: Low (learning is goal)
- Budget: Moderate ($120k for education investment)
- Goal: Build team capability, not just ship features

**Real-World Example**: Training team on modern microservices

**Why Each Strategy Ranks**:

1. **PARALLEL (B)**: ⭐⭐⭐⭐⭐ EXCELLENT FOR TRAINING
    - Pros: New team builds in greenfield (learns without constraints)
    - Legacy team maintains (hands-on learning)
    - Time to learn patterns (not rushing)
    - Cons: High cost (but justified for training)
    - Recommendation: **CHOOSE THIS**
    - Reasoning: Educational value justifies cost
    - Benefit: Team can apply patterns to future projects

2. **HYBRID (C)**: ⭐⭐⭐ GOOD ALTERNATIVE
    - Pros: Team learns new patterns on selective features
    - Cons: Less comprehensive (only 10% of system new)
    - Recommendation: If budget lower or timeline tighter

3. **INCREMENTAL (A)**: ⭐⭐ LESS IDEAL
    - Pros: Learning happens, but incremental
    - Cons: Refactoring has risk, learning pressure higher
    - Recommendation: If budget is absolutely constrained

---

### Use Case 6: "Performance Optimization Crisis"

**Organization Profile**:

- Team size: 2-3 developers
- Current codebase: 20,000 LOC (working but slow)
- Performance issue: System handles 100 users max (need 10,000)
- Architecture clarity: Clear (monolithic)
- Risk tolerance: Low (users affected)
- Timeline pressure: Very High (fix needed in 6 weeks)
- Budget: Moderate ($100k)
- Goal: Scale from 100 to 10,000 concurrent users

**Real-World Example**: Gaming service hitting scaling bottleneck

**Why Each Strategy Ranks**:

1. **INCREMENTAL (A)**: ⭐⭐⭐⭐ FAST FIT
    - Pros: Can optimize existing code (direct win)
    - Refactoring for performance is lower-risk
    - Timeline: 10 weeks (fits emergency)
    - Cons: May hit architectural limits
    - Recommendation: **CHOOSE THIS FIRST**
    - Plan B: If hitting limits by week 5, pivot to parallel

2. **HYBRID (C)**: ⭐⭐⭐ CONTINGENCY
    - Pros: Can build optimized version in parallel
    - Cons: 12-14 weeks is too long (need fix sooner)
    - Recommendation: Only if incremental finds showstoppers

3. **PARALLEL (B)**: ⭐ NOT FOR THIS
    - Pros: Clean system can be built for performance
    - Cons: 16 weeks is too slow (business can't wait)
    - Recommendation: No (timeline kills this)

---

### Use Case 7: "Known Technical Debt Crisis"

**Organization Profile**:

- Team size: 4-5 developers
- Current codebase: 30,000 LOC
- Technical debt: Massive (5+ years of patches)
- Developer velocity: Very slow (30% time on bugs)
- Risk tolerance: Medium (accepted we must refactor)
- Timeline pressure: Moderate (Q4 deadline)
- Budget: $150k (justified by productivity loss)
- Goal: Reduce 30% bug time to 5% after refactor

**Real-World Example**: Enterprise SaaS platform with aging codebase

**Why Each Strategy Ranks**:

1. **PARALLEL (B)**: ⭐⭐⭐⭐⭐ EXCELLENT
    - Pros: Fresh build avoids propagating old debt
    - Zero risk of spreading existing bugs
    - Clear before/after comparison
    - Cons: High cost (justified by productivity gains)
    - Recommendation: **CHOOSE THIS**
    - ROI: If 30%→5% bug time, pays for itself in 3 months

2. **HYBRID (C)**: ⭐⭐⭐ FALLBACK
    - Pros: Selective rebuild (riskiest parts only)
    - Cons: May not address root causes
    - Recommendation: If parallel budget denied

3. **INCREMENTAL (A)**: ⭐ RISKY
    - Pros: Direct improvement possible
    - Cons: High risk of propagating debt or missing issues
    - Recommendation: No (refactoring debt-ridden code is risky)

---

## PART 2: SCENARIO TREES

### Scenario A: "We're Unsure Which Strategy"

```
START: Unsure about deployment strategy
  │
  ├─ Q1: How many developers do we have?
  │  ├─ 1-2: Go to Q2A
  │ └─ 3-5: Go to Q2B
  │  └─ 6+: Go to Q2C
  │
  ├─ Q2A: (1-2 devs) Is team under time pressure?
  │  ├─ YES (need features fast): INCREMENTAL (A) ✅
  │  └─ NO (have 12+ weeks): INCREMENTAL (A) OR HYBRID (C) if budget allows
  │
  ├─ Q2B: (3-5 devs) What's our budget?
  │  ├─ Limited ($80k): INCREMENTAL (A) ✅
  │  ├─ Moderate ($120k): HYBRID (C) ✅ (selective parallel)
  │  └─ High ($180k): Could do PARALLEL (B), but INCREMENTAL likely better
  │
  ├─ Q2C: (6+ devs) What's our uptime requirement?
  │  ├─ Standard (99%): INCREMENTAL (A) ✅
  │  ├─ High (99.9%): HYBRID (C) or PARALLEL (B)
  │  └─ Mission-critical (99.99%): PARALLEL (B) ✅
  │
  └─ DECISION: Follow path above to strategy choice
```

---

### Scenario B: "We Started Incremental, but Having Issues"

```
WEEK 5: We're doing INCREMENTAL, but team reports challenges
  │
  ├─ Challenge: "Refactoring is surfacing too many bugs"
  │  └─ Solution: Switch to HYBRID at this point
  │     ├─ Keep incremental for stable features
  │     └─ Move complex features to parallel build
  │     └─ Timeline: +2-3 weeks (acceptable)
  │
  ├─ Challenge: "KidnappersGame is unexpectedly complex"
  │  └─ Solution: Spin up parallel build for that game only
  │     ├─ Keep other games incremental
  │     └─ Validate new architecture on this game
  │     └─ Timeline: +1-2 weeks
  │
  ├─ Challenge: "Team is moving slower than expected"
  │  └─ Solution: A) Hire temporary contractor, or
  │              B) Extend timeline (shift to weeks 12-14), or
  │              C) Reduce scope (postpone 1 game to next cycle)
  │
  ├─ Challenge: "We found major architectural issue"
  │  └─ Solution: Pause incremental, evaluate:
  │     ├─ Can it be fixed incrementally? YES → Continue
  │     └─ Does it require rebuild? YES → Switch to HYBRID
  │
  └─ DECISION: Adapt strategy, communicate timeline change
```

---

### Scenario C: "External Factors Force Pivot"

```
MID-PROJECT: External change forces strategy reconsideration
  │
  ├─ EVENT: "CTO says 'must be 99.99% stable'"
  │  ├─ If INCREMENTAL: Increase test coverage to 95%+
  │  ├─ If HYBRID: Ensure parallel build is rock-solid
  │  └─ If PARALLEL: Was right call, proceed as planned
  │
  ├─ EVENT: "Budget got cut in half"
  │  ├─ If INCREMENTAL: Continue (can't cut further)
  │  ├─ If HYBRID: Reduce scope to core features only
  │  └─ If PARALLEL: MUST ABORT (can't afford this)
  │
  ├─ EVENT: "Two more developers became available"
  │  ├─ If INCREMENTAL: Move to HYBRID (parallelize)
  │  ├─ If HYBRID: Could accelerate to PARALLEL if time permits
  │  └─ If PARALLEL: Already doing this, add more resources
  │
  ├─ EVENT: "Competitive feature appeared, need to ship NOW"
  │  ├─ If INCREMENTAL: Accelerate (12-day sprints instead of 14)
  │  ├─ If HYBRID: Keep games, cut analytics to post-launch
  │  └─ If PARALLEL: You're doomed (can't accelerate this)
  │
  └─ DECISION: Evaluate feasibility of strategy change
```

---

## PART 3: STRATEGY SELECTION BY CONSTRAINT

### By Budget

```
< $80k Budget
└─ MUST USE: INCREMENTAL (A) only
   └─ Other strategies cost more

$80-120k Budget
├─ RECOMMENDED: INCREMENTAL (A)
└─ OPTION: HYBRID (C) if team wants validation

$120-180k Budget
├─ OPTION: HYBRID (C) - best choice
└─ OPTION: INCREMENTAL (A) - over-budgeted, easier execution

> $180k Budget
├─ OPTION: PARALLEL (B) if risk tolerance high
├─ OPTION: HYBRID (C) if risk tolerance medium
└─ OPTION: INCREMENTAL (A) if risk tolerance low
```

---

### By Timeline

```
< 6 weeks (EMERGENCY TIMELINE)
└─ No viable strategy
   └─ Must either extend timeline or reduce scope

6-10 weeks
├─ ONLY OPTION: INCREMENTAL (A)
└─ Alternatives too slow

10-14 weeks
├─ PREFERRED: INCREMENTAL (A)
├─ OPTION: HYBRID (C)
└─ NOT: PARALLEL (B) - cutover risk in crunch

14-20 weeks
├─ OPTION: INCREMENTAL (A) - comfortable pace
├─ OPTION: HYBRID (C) - good fit
└─ OPTION: PARALLEL (B) - can execute with comfort

> 20 weeks
├─ ALL OPTIONS VIABLE
└─ Choose based on other factors (budget, team, risk)
```

---

### By Team Size

```
1 Developer
└─ ONLY OPTION: INCREMENTAL (A) - can't parallel

2 Developers
├─ PREFERRED: INCREMENTAL (A)
└─ OPTION: HYBRID (C) if they can wear two hats

3-4 Developers
├─ GOOD: INCREMENTAL (A)
├─ BETTER: HYBRID (C) - balanced team split
└─ POSSIBLE: PARALLEL (B) if staggered teams

5-6 Developers
├─ GOOD: HYBRID (C)
├─ POSSIBLE: PARALLEL (B)
└─ RISKY: INCREMENTAL (A) - team will context-switch too much

7+ Developers
├─ GOOD: PARALLEL (B) - fully separate teams
├─ POSSIBLE: HYBRID (C) - still good
└─ RISKY: INCREMENTAL (A) - too much idle time

(Note: More people doesn't always = better.
 INCREMENTAL works best with 1-2 focused people.
 PARALLEL needs 4-6+ to justify cost)
```

---

### By Risk Tolerance

```
Very Low (99.99% uptime required, regulated)
├─ BEST: PARALLEL (B) - frozen legacy is safest
└─ ACCEPTABLE: HYBRID (C)

Low (Mission-critical, big impact if down)
├─ BEST: HYBRID (C) - lower risk than parallel
└─ ACCEPTABLE: INCREMENTAL (A) with high test coverage

Medium (Internal use, can tolerate brief issues)
├─ BEST: INCREMENTAL (A) - default choice
└─ GOOD: HYBRID (C)

High (Early-stage, can handle rough edges)
├─ GOOD: INCREMENTAL (A)
├─ GOOD: HYBRID (C)
└─ ACCEPTABLE: PARALLEL (B)

Very High (Startup, "move fast and break things")
├─ BEST: INCREMENTAL (A) - fastest market delivery
└─ ACCEPTABLE: HYBRID (C)
```

---

## PART 4: DECISION TEMPLATES

### Template 1: Approval Document

```
DEPLOYMENT STRATEGY APPROVAL
──────────────────────────────

Project: [Project Name]
Date: [Date]
Approved By: [Name/Role]

SELECTED STRATEGY: [INCREMENTAL / HYBRID / PARALLEL]

RATIONALE:
• Team size: [X] people
• Budget: $[XXX]k
• Timeline: [X] weeks
• Risk tolerance: [Low/Medium/High]
• Primary driver: [Why this strategy]

SUCCESS CRITERIA:
☐ All tests passing (>80% coverage)
☐ Performance benchmarks met
☐ Zero critical bugs in production
☐ All features shipping on schedule
☐ Team morale high

GO/NO-GO DECISION POINTS:
• Week 5: Evaluate progress
  └─ Continue with strategy OR pivot to alternative
• Week 10: Final launch readiness
  └─ Launch OR extend timeline

CONTINGENCY PLAN:
If [CONDITION], switch to [ALTERNATIVE STRATEGY]
Budget reserve: $[XX]k (5-10% contingency)

Approved:
_________________  _______________
Signature          Date
```

---

### Template 2: Risk Assessment Matrix

```
DEPLOYMENT STRATEGY RISK ASSESSMENT
────────────────────────────────────

Strategy: [INCREMENTAL / HYBRID / PARALLEL]

Risk Category          Probability  Impact  Mitigation
──────────────────────────────────────────────────
Refactoring bugs       [LOW/MED]    [MED]   >80% test coverage
Performance regression [LOW]        [LOW]   Load testing
Team burnout          [LOW]        [MED]   Reasonable pace
Budget overrun        [MED]        [MED]   +10% contingency
Cutover failure       [HIGH/LOW]   [VERY] If parallel: runbooks
Timeline slip         [LOW/MED]    [LOW]   Clear phases

RISK SCORE: [1-10] (lower = better)
CONFIDENCE: [90%+]
RECOMMENDATION: [PROCEED / PAUSE / PIVOT]
```

---

## SUMMARY TABLE: Use Cases at a Glance

| Use Case             | Size | Codebase  | Risk     | Budget | Timeline | Winner     |
| -------------------- | ---- | --------- | -------- | ------ | -------- | ---------- |
| Veratown             | 1-2  | 13k LOC   | Med      | $80k   | 10 wks   | **INCR**   |
| Large Legacy Rewrite | 6-8  | 100k+ LOC | High     | $250k  | 18 mo    | **PARA**   |
| Regulated Payment    | 4-6  | 50k LOC   | Very Low | $150k  | 6 mo     | **PARA**   |
| Startup MVP Expand   | 1-2  | 5k LOC    | High     | $50k   | 6 wks    | **INCR**   |
| Team Training        | 3-4  | 15k LOC   | Med      | $120k  | 6 mo     | **PARA**   |
| Performance Crisis   | 2-3  | 20k LOC   | Low      | $100k  | 6 wks    | **INCR**   |
| Tech Debt Crisis     | 4-5  | 30k LOC   | Med      | $150k  | 12 wks   | **PARA**   |
| Well-Funded Startup  | 2-4  | 10k LOC   | Med-High | $150k  | 3 mo     | **HYBRID** |

---

**Conclusion**: No single strategy is universally "best."
The right choice depends on **your specific constraints**.

Use this guide to find your scenario and make an informed decision.

---

**Document Author**: Architecture Team  
**Date**: September 3, 2026  
**Status**: Ready for reference

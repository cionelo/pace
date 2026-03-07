# pace-charts-togglefilter.md

## Purpose

This document outlines a set of pacing analysis charts designed for **collegiate distance track races** (1500m–10,000m).

The charts allow coaches, analysts, and athletes to **visualize race dynamics using split data**, including pacing changes, position movement, and time gaps.

Each chart is designed to work within a **toggle/filter interface**, allowing users to:

* Select specific athletes
* Compare athletes head-to-head
* Adjust split ranges or race segments
* Change reference runners (leader, average, selected athlete)

The goal is to make **race pacing patterns visually intuitive** while maintaining analytical depth.

---

# Core Charts

The following five charts form the **foundation of the pacing visualization system**.

These should be implemented first and made accessible through a **chart toggle interface**.

Example UI concept:

```
[Virtual Gap] [Split Delta] [Position] [Lap Pace] [Time Gain/Loss]
```

---

# 1. Virtual Gap Chart

## Purpose

Shows how the **time gap between athletes evolves throughout the race**.

This chart provides a clear visual narrative of the race, showing when athletes:

* closed gaps
* lost contact with the lead pack
* made decisive moves

## Axes

**X-axis**

Distance or lap number

Examples:

```
400m | 800m | 1200m | 1600m | 2000m
```

**Y-axis**

Time difference from a reference athlete (seconds)

Default reference:

* race leader

Optional references:

* selected athlete
* field average

## Interpretation

Upward slope → athlete is **losing time**
Downward slope → athlete is **gaining time**

Flat line → athlete is **matching pace**

## Example Insight

A runner who stays within **1–2 seconds of the leader until 2800m** before losing contact likely experienced the decisive surge in that segment.

## Filters

* athlete selection
* reference athlete
* lap range
* smoothing (optional)

## Implementation Notes

Data requirement:

```
split_time[athlete][distance]
```

Gap calculation:

```
gap = athlete_split_time - reference_split_time
```

---

# 2. Split Delta Chart

## Purpose

Compares **split differences between athletes at each segment**.

This is particularly useful for **head-to-head pacing comparisons**.

## Axes

**X-axis**

Split segment

Example:

```
Lap 1 | Lap 2 | Lap 3 | Lap 4 | Lap 5
```

**Y-axis**

Time difference (seconds)

## Interpretation

Positive values → athlete A slower in that segment
Negative values → athlete A faster in that segment

## Example Insight

Two athletes may finish with similar times but one may gain **most of their advantage in the final 800m**.

This chart isolates exactly **where time was gained or lost**.

## Filters

* athlete A
* athlete B
* lap range

## Implementation Notes

Segment delta:

```
delta = splitA_segment - splitB_segment
```

Segment splits should be calculated as:

```
segment_time = split_time_n - split_time_n-1
```

---

# 3. Position vs Distance Chart

## Purpose

Visualizes **how an athlete’s race position changes throughout the race**.

This chart highlights **tactical racing**, which split times alone cannot reveal.

## Axes

**X-axis**

Distance or lap

**Y-axis**

Race position

Example:

```
1 (leader)
2
3
4
...
```

Lower numbers represent better positions.

## Interpretation

Upward movement → athlete **moving back in the field**

Downward movement → athlete **passing competitors**

## Example Insight

A runner who moves from **12th place at 2000m to 3rd place by 3200m** executed a strong mid-race move.

## Filters

* athlete selection
* pack size
* lap range

## Implementation Notes

Position must be calculated at each split:

```
position = rank(split_time at distance)
```

---

# 4. Lap Pace Chart

## Purpose

Displays **pace per lap or race segment**.

This chart helps identify:

* negative splits
* surges
* race slowdowns
* closing kicks

## Axes

**X-axis**

Lap number

**Y-axis**

Lap time (seconds)

Example:

```
Lap 1 | Lap 2 | Lap 3 | Lap 4 | Lap 5
```

## Interpretation

Downward trend → accelerating pace

Upward trend → slowing pace

Sharp drops → finishing kick

## Example Insight

An athlete who runs:

```
63 | 62 | 61 | 58
```

demonstrates a **progressive acceleration**.

## Filters

* athlete
* smoothing
* segment length (400m / 800m)

## Implementation Notes

Lap time calculation:

```
lap_time = split_n - split_n-1
```

---

# 5. Time Gain/Loss Chart

## Purpose

Shows **how much time an athlete gained or lost during each race segment relative to a reference**.

Unlike the Virtual Gap Chart, this measures **incremental changes rather than cumulative gap**.

## Axes

**X-axis**

Race segment

**Y-axis**

Time gained or lost (seconds)

## Interpretation

Negative value → athlete gained time
Positive value → athlete lost time

## Example Insight

A runner may lose small amounts of time early but gain **1.5 seconds in the final lap**, indicating a decisive finishing kick.

## Filters

* athlete selection
* reference athlete
* lap range

## Implementation Notes

Segment comparison:

```
gain_loss = segment_time_athlete - segment_time_reference
```

---

# Advanced Charts (Future Development)

These charts provide deeper race analysis and may be implemented after the core system.

---

## Race Flow Chart

Displays **multiple athletes’ time gaps simultaneously**.

Useful for visualizing:

* pack formation
* breakaways
* chase groups

This chart resembles race analysis used in **professional cycling broadcasts**.

---

## Surge Detection Chart

Identifies segments where pace exceeds a defined threshold relative to average pace.

Useful for detecting:

* race attacks
* decisive surges
* championship race tactics.

---

## Pack Spread Chart

Measures the **time spread between athletes across the field**.

Useful for identifying when:

* the pack remains tight
* the race begins to fragment.

---

# Intended Users

Primary users include:

* collegiate distance coaches
* performance analysts
* athletes reviewing race execution.

The charts are designed to make **complex pacing dynamics easy to interpret**, while still allowing detailed split analysis.

---

# Summary

The pacing analysis system centers around five primary charts:

1. Virtual Gap Chart
2. Split Delta Chart
3. Position vs Distance Chart
4. Lap Pace Chart
5. Time Gain/Loss Chart

Together, these visualizations allow coaches and analysts to understand:

* **when the race changed**
* **where time was gained or lost**
* **how athletes positioned themselves tactically**
* **how pacing strategies unfolded**
* **who executed the strongest finishing segments**

These charts provide a **complete analytical framework for collegiate distance track races**.

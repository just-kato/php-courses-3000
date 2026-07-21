import type { ContentPackage } from './types';

const pkg: ContentPackage = {
  module: {
    id: 'mod-1',
    title: 'Overview of Mortgage Lending',
    description: 'History of U.S. mortgage lending, GSEs, federal regulatory agencies, and fair housing law.',
    lessons: [
      {
        id: 'mod-1-l1',
        moduleId: 'mod-1',
        title: 'History of U.S. Mortgage Lending',
        body: `## Key Legislative Milestones

The U.S. mortgage lending system evolved through a series of landmark laws, each responding to economic crises or market needs.

### Federal Reserve Act (1913)

The Federal Reserve Act created the Federal Reserve System — the central banking system of the United States. It allowed banks to make real estate loans and gave the U.S. government a mechanism to **influence interest rates** through monetary policy.

### Federal Home Loan Bank Act (1932)

In response to the Great Depression, the Federal Home Loan Bank Act created:

- A system of **11 Federal Home Loan Banks (FHLBanks)**
- The **Office of Finance**, which coordinates funding for the FHLBank system

The FHLBanks provide liquidity to member financial institutions, supporting mortgage lending across the country.

### Banking Act of 1933 (Glass-Steagall)

This pivotal act:

- Created the **Federal Deposit Insurance Corporation (FDIC)**, insuring bank deposits
- **Separated commercial banking from investment banking**, reducing systemic risk

### National Housing Act (1934)

Established two critical institutions:

- **Federal Housing Administration (FHA)** — insures lenders against losses if borrowers default. FHA does **not** lend money directly; it insures the lender.
- **Federal Savings and Loan Insurance Corporation (FSLIC)** — insured savings and loan deposits (later replaced by FDIC coverage)

### FHA Joins HUD (1965)

In 1965, the FHA became part of the newly created **Department of Housing and Urban Development (HUD)**.

---

## Summary Table

| Year | Legislation | Key Creation |
|------|-------------|--------------|
| 1913 | Federal Reserve Act | Federal Reserve System |
| 1932 | Federal Home Loan Bank Act | 11 FHLBanks + Office of Finance |
| 1933 | Glass-Steagall (Banking Act) | FDIC; separated commercial/investment banking |
| 1934 | National Housing Act | FHA, FSLIC |
| 1965 | — | FHA moved to HUD |
`,
      },
      {
        id: 'mod-1-l2',
        moduleId: 'mod-1',
        title: 'GSEs & the Secondary Mortgage Market',
        body: `## What Is the Secondary Market?

When a lender originates a mortgage (the **primary market**), it can sell that loan to investors on the **secondary market**. This frees up capital so lenders can make more loans.

**Government-Sponsored Enterprises (GSEs)** are federally chartered companies that drive this process.

---

## The GSEs: Fannie Mae, Freddie Mac, and FHLB

### Fannie Mae (1938)

- Created in **1938** as part of FDR's New Deal
- Formally: **Federal National Mortgage Association (FNMA)**
- Purchases mortgages from lenders, pools them into **Mortgage-Backed Securities (MBS)**, and **guarantees** them for sale to investors

### Freddie Mac (1970)

- Created in **1970** as the **Federal Home Loan Mortgage Corporation (FHLMC)**
- Performs the same role as Fannie Mae — creating competition in the secondary market
- Also packages loans into MBS and guarantees them

### Federal Home Loan Bank System (FHLB)

- Established in **1932** (Federal Home Loan Bank Act)
- A system of 11 regional banks that provide **advance loans (liquidity)** to member institutions: banks, credit unions, insurance companies
- Also a GSE

---

## Ginnie Mae (1968)

**Ginnie Mae (Government National Mortgage Association)** is a U.S. **government agency** — not a GSE — and a division of HUD.

- Split off from Fannie Mae in **1968**
- Guarantees MBS backed by **government-insured loans**: FHA, VA, and USDA loans
- Unlike Fannie/Freddie, Ginnie Mae **does not purchase loans** — it only provides the government's full-faith-and-credit guarantee on the MBS

---

## How Mortgage-Backed Securities (MBS) Work

1. Lender originates loans to borrowers
2. GSE (Fannie/Freddie) **buys the loans** from the lender
3. GSE pools the loans and issues **MBS** to investors
4. Investors receive monthly payments derived from borrower mortgage payments
5. GSE **guarantees** the MBS against default losses

---

## Summary

| Entity | Year | Type | Role |
|--------|------|------|------|
| FHLB | 1932 | GSE | Liquidity advances to member institutions |
| Fannie Mae | 1938 | GSE | Buys loans, issues/guarantees MBS |
| Ginnie Mae | 1968 | Gov't Agency (HUD) | Guarantees MBS of gov't-insured loans |
| Freddie Mac | 1970 | GSE | Buys loans, issues/guarantees MBS |
`,
      },
      {
        id: 'mod-1-l3',
        moduleId: 'mod-1',
        title: 'Federal Regulatory Agencies',
        body: `## Overview

Multiple federal agencies regulate different segments of the mortgage and banking industry. On the NMLS exam, you must know **who regulates whom** and **when each agency was created**.

---

## The Key Agencies

### Office of the Comptroller of the Currency (OCC) — 1863

- **Charters, regulates, and supervises national banks**
- Part of the U.S. Department of the Treasury
- One of the oldest federal financial regulators

### Federal Deposit Insurance Corporation (FDIC) — 1933

- Created by the **Glass-Steagall Act (Banking Act of 1933)**
- **Insures bank deposits** up to statutory limits
- Also supervises state-chartered banks that are not Federal Reserve members

### National Credit Union Administration (NCUA) — 1970

- **Insures deposits at credit unions** (equivalent to FDIC for banks)
- Also charters and supervises federal credit unions

### Federal Financial Institutions Examination Council (FFIEC) — 1979

- An **interagency body** that prescribes **uniform examination standards** for financial institutions
- Members include: Federal Reserve, FDIC, OCC, NCUA, CFPB
- Does not directly supervise institutions — it coordinates and standardizes examinations across agencies

### Federal Housing Finance Agency (FHFA) — 2008

- Created by the **Housing and Economic Recovery Act of 2008**
- Supervises **Fannie Mae, Freddie Mac**, and the **Federal Home Loan Bank System**
- Became conservator of Fannie/Freddie during the 2008 financial crisis

### Consumer Financial Protection Bureau (CFPB) — 2010

- Created by the **Dodd-Frank Wall Street Reform and Consumer Protection Act (2010)**
- Enforces laws and rules applying to **financial products, institutions, and individual providers**
- Regulates mortgage loan originators, servicers, and other consumer financial products

### State Regulators

- **Non-depository mortgage lenders** (lenders not chartered as banks or credit unions) are regulated **within each state by that state's primary regulator**
- This is why MLOs must obtain a license in each state where they originate loans

---

## Summary Table

| Agency | Year | Primary Role |
|--------|------|--------------|
| OCC | 1863 | Charters/supervises national banks |
| FDIC | 1933 | Insures bank deposits |
| NCUA | 1970 | Insures credit union deposits |
| FFIEC | 1979 | Uniform examination standards (interagency) |
| FHFA | 2008 | Supervises Fannie Mae, Freddie Mac, FHLB |
| CFPB | 2010 | Consumer financial protection & enforcement |
| State Regulators | Varies | Non-depository mortgage lenders |
`,
      },
      {
        id: 'mod-1-l4',
        moduleId: 'mod-1',
        title: 'Fair Housing & Consumer Protection',
        body: `## The Federal Fair Housing Act

The **Federal Fair Housing Act** (Title VIII of the Civil Rights Act of 1968) prohibits discrimination in housing-related transactions based on **protected characteristics**.

---

## The 7 Protected Classes

It is illegal to discriminate in mortgage lending based on:

1. **Race**
2. **Color**
3. **National Origin**
4. **Sex**
5. **Religion**
6. **Familial Status** — having children under 18, pregnancy, or in the process of adopting
7. **Disability** — physical or mental impairment that substantially limits a major life activity

> **Exam tip:** Memorize all seven. They appear on the NMLS exam frequently. Note that **age**, **income source**, and **sexual orientation** are **not** federal protected classes (though many states add them).

---

## Prohibited Conduct

Fair housing laws apply directly to mortgage lending. Lenders cannot:

- **Refuse** to make a mortgage based on a protected class
- Offer **different terms** (higher rates, fees, worse conditions) based on protected class — this is called **disparate treatment**
- **Redline** — refuse to lend in geographic areas due to the racial or ethnic composition of those areas
- **Steer** borrowers toward or away from neighborhoods based on a protected class

---

## The CFPB's Enforcement Role

The **Consumer Financial Protection Bureau (CFPB)**, created by Dodd-Frank in 2010, is the primary federal agency for:

- Enforcing fair lending laws in **mortgage origination**
- Writing rules for mortgage disclosures (TRID/RESPA), servicing requirements, etc.
- Taking enforcement action (civil penalties, restitution) against discriminating lenders

HUD and the Department of Justice also have enforcement roles under the Fair Housing Act.

---

## State Protections

Many states add **additional protected classes** beyond the federal seven — for example, sexual orientation, marital status, or source of income. As a licensed MLO you must comply with **both federal and state** fair housing requirements in every state where you originate.

---

## Key Takeaway

For the NMLS exam: **memorize the 7 federal protected classes cold**. Also know that the CFPB — established by Dodd-Frank in 2010 — is the primary federal enforcement agency for consumer financial product discrimination.
`,
      },
    ],
  },

  flashcards: [
    {
      id: 'mod-1-fc-1',
      moduleId: 'mod-1',
      question: 'What created a system allowing banks to make real estate loans and let the U.S. government influence interest rates?',
      answer: 'Federal Reserve Act (1913)',
    },
    {
      id: 'mod-1-fc-2',
      moduleId: 'mod-1',
      question: 'What created a system of 11 Federal Home Loan Banks and the Office of Finance in 1932?',
      answer: 'Federal Home Loan Bank Act',
    },
    {
      id: 'mod-1-fc-3',
      moduleId: 'mod-1',
      question: 'What act created the FDIC in 1933 and separated investment/commercial banking?',
      answer: 'Glass-Steagall Act (Banking Act of 1933)',
    },
    {
      id: 'mod-1-fc-4',
      moduleId: 'mod-1',
      question: 'What 1934 act established the FHA and FSLIC?',
      answer: 'National Housing Act',
    },
    {
      id: 'mod-1-fc-5',
      moduleId: 'mod-1',
      question: 'What does FHA insurance protect against, and who does it protect?',
      answer: 'Protects the lender from loss if the borrower defaults',
    },
    {
      id: 'mod-1-fc-6',
      moduleId: 'mod-1',
      question: 'What year did FHA become part of HUD?',
      answer: '1965',
    },
    {
      id: 'mod-1-fc-7',
      moduleId: 'mod-1',
      question: 'Name the GSEs from this section.',
      answer: 'Fannie Mae, Freddie Mac, and FHLB',
    },
    {
      id: 'mod-1-fc-8',
      moduleId: 'mod-1',
      question: 'What year was Fannie Mae established? Freddie Mac?',
      answer: 'Fannie Mae 1938; Freddie Mac 1970',
    },
    {
      id: 'mod-1-fc-9',
      moduleId: 'mod-1',
      question: 'What do Fannie/Freddie do with loans they purchase?',
      answer: 'Package them into mortgage-backed securities (MBS) and guarantee them for sale to investors',
    },
    {
      id: 'mod-1-fc-10',
      moduleId: 'mod-1',
      question: 'What agency charters/regulates/supervises national banks, and what year?',
      answer: 'OCC — 1863',
    },
    {
      id: 'mod-1-fc-11',
      moduleId: 'mod-1',
      question: 'What agency insures bank deposits and was created by Glass-Steagall?',
      answer: 'FDIC — 1933',
    },
    {
      id: 'mod-1-fc-12',
      moduleId: 'mod-1',
      question: 'What agency insures deposits at credit unions?',
      answer: 'NCUA — 1970',
    },
    {
      id: 'mod-1-fc-13',
      moduleId: 'mod-1',
      question: 'What interagency body sets uniform standards for examining financial institutions?',
      answer: 'FFIEC — 1979',
    },
    {
      id: 'mod-1-fc-14',
      moduleId: 'mod-1',
      question: 'What agency supervises Fannie Mae, Freddie Mac, and the FHLBank System?',
      answer: 'FHFA — 2008',
    },
    {
      id: 'mod-1-fc-15',
      moduleId: 'mod-1',
      question: 'What agency split from Fannie Mae in 1968 and guarantees MBS backed by government-insured loans (FHA/VA/USDA)?',
      answer: 'Ginnie Mae',
    },
    {
      id: 'mod-1-fc-16',
      moduleId: 'mod-1',
      question: 'Protected classes under the Federal Fair Housing statute?',
      answer: 'Race, color, national origin, sex, religion, familial status, disability',
    },
    {
      id: 'mod-1-fc-17',
      moduleId: 'mod-1',
      question: 'What act established the CFPB, and in what year?',
      answer: 'Dodd-Frank — 2010',
    },
    {
      id: 'mod-1-fc-18',
      moduleId: 'mod-1',
      question: 'Who regulates non-depository mortgage lenders within a state?',
      answer: "Each state's primary regulator",
    },
  ],

  quizQuestions: [
    {
      id: 'mod-1-q-1',
      moduleId: 'mod-1',
      prompt: 'The ___ created a system that allows banks to make real estate loans and the U.S. government to influence interest rates.',
      choices: [
        'Federal Deposit Insurance Corporation',
        'Federal Reserve Act',
        'Consumer Financial Protection Bureau',
        'Federal Home Loan Bank Act',
      ],
      correctIndex: 1,
      explanation: 'The Federal Reserve System was created by the Federal Reserve Act. It lets banks make real estate loans and lets the government influence interest rates through monetary policy.',
    },
    {
      id: 'mod-1-q-2',
      moduleId: 'mod-1',
      prompt: 'A system of 11 Federal Home Loan Banks and the Office of Finance was created in 1932 by the ___.',
      choices: [
        'FDIC',
        'Federal Home Loan Bank Act',
        'Federal Reserve Act',
        'CFPB',
      ],
      correctIndex: 1,
      explanation: 'The Federal Home Loan Bank Act (1932) created the 11 FHLBanks and the Office of Finance in response to the Great Depression.',
    },
    {
      id: 'mod-1-q-3',
      moduleId: 'mod-1',
      prompt: 'The Glass-Steagall Act of 1933 created the ___.',
      choices: [
        'Federal Home Loan Bank Act',
        'CFPB',
        'Federal Deposit Insurance Corporation',
        'Federal Reserve Act',
      ],
      correctIndex: 2,
      explanation: 'The Banking Act of 1933 (Glass-Steagall) created the FDIC and separated commercial banking from investment banking.',
    },
    {
      id: 'mod-1-q-4',
      moduleId: 'mod-1',
      prompt: '___ and FHLB are considered Government-Sponsored Enterprises (GSEs).',
      choices: [
        'Fannie Mae',
        'FHA',
        'Ginnie Mae',
      ],
      correctIndex: 0,
      explanation: 'Fannie Mae and FHLB are both GSEs. FHA is a federal agency; Ginnie Mae is a government agency within HUD, not a GSE.',
    },
    {
      id: 'mod-1-q-5',
      moduleId: 'mod-1',
      prompt: 'The ___ enforces laws and rules that apply to financial products, institutions, and individual providers.',
      choices: [
        'Consumer Financial Protection Bureau',
        'FDIC',
        'Federal Reserve Act',
        'Federal Home Loan Bank Act',
      ],
      correctIndex: 0,
      explanation: 'The CFPB, created by the Dodd-Frank Act in 2010, enforces laws and rules for consumer financial products, institutions, and individual providers like MLOs.',
    },
  ],
};

export default pkg;

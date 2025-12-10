# Agent Instructions for ExpLens Static Site

## Overall Goal

- Build a modern, visually appealing static website for ExpLens and place it in `docs/`.
  The site must be self-contained in that directory.
- The site must work smoothly on both desktop and mobile.
- Use existing logos in `public/icons`; generate any other graphics as needed.
- All content under `docs/app/` is to be ignored and must be left unchanged.

## Design guidelines:

- Use a light, bright professional color scheme, compatible with the existing logo.
- You must, generate new images and graphics, and incorporate them into the pages to create a professionally
  looking site with a financial analysis look & feel.

## Content guidelines:

- Use clear formulations. Do not be wordy.
- Use as many words as you need to bring a point across, but do not create long, good sounding descriptions
  that do not add useful information.

## Index Page Messaging

Index page must be visually appealing, with modern style graphics symbolizing the essence of the content.
Generate graphics for this.

Main points to get across:

### Core value proposition

ExpLens enables people to very easily analyze personal finances on a level that far exceeds what other existing
personal software systems allow. It does it by exposing bank data, including a lot of valuable metadata, in
spreadsheets.

### Core High level approach.

#### Problem being solved:

- Modern personal finance software does not allow any comprehensive analysis. Typically, there is only one
  dimension by which transactions can be analyzed: the expense category (i.e. what was the money spent for).

- But much is missing. E.g. what was the purpose of the expense? What family member made it? Is this expense
  deductible for the family business or a rental property, and if so, in which tax category? And so on.

- Some software packages allow tags, but they are not structured, and do not allow for any conclusive analysis,
  like pivot tables, charts and summaries, that use multiple categories (aka dimensions).

#### ExpLens solution:

- ExpLens addresses that: It downloads your complete banks data into a spreadsheet and helps you get stated with
  analyzing it. It supports as many categories / dimensions as you like. This flexible, multidimensional analysis is
  the core unique value of ExpLens.

- ExpLens keeps all your data in your spreadsheet. You never loose control. If you ever stop using ExpLens
  (you probably won’t but its your choice), all your data remains with you, and you keep access forever.

- There are other tools that attempt working with spreadsheets, but ExpLens has unique capabilities aimed at
  comprehensive analysis:
    - Unlike other tools attempting to do with spreadsheets, ExpLens can download years of data within a few
      seconds.
    - Unlike other tools, ExpLens includes metadata from banking provides that ore-categorize transactions and
      merchants. You automatically know what potential credit card point are applicable and you have a first stab on
      expense categories without lifting a finger.
    - Multiple analysis dimensions are supported and deeply integrated.
    - You can categorize the transactions within you spreadsheet, and it is uploaded back to the cloud. That means
      you can have as many spreadsheets as you like, all beneficing and sharing the data.

### Cost

ExpLens is free.
If it really helps you, you can donate (system is being set up, link coming soon).
Notably, ExpLens works with Lunch Money to access your bank data. All your data is securely stored on their server.
You need a subscription for Lunch Money to sync your data. They offer a free trial.
Long term, they follow a pay-as-you-want model, starting at $50 a year or $10 a month.
See https://lunchmoney.app/pricing

### Further reading

Each of this is a link. Generate a catchy title and a brief extrapolated description (1-2 sentences).
For now, these are placeholders. Generate placeholder pages with a few lorem ipsum paragraphs.
Make sure they are visually appealing and fit into the overall design.

- Installing ExpLens

- How ExpLens manages as many analysis categories as you want and how you can easily use that data.

- How to connect ExpLens to Lunch Money (you need an special password, called “API Token”).

## Notes

### A dataioled example for multiple dimensions

An example that can be used somewhere to clarify the need for multiple dimensions.
This is too detailes to be in early focus, but in some form may be present in an educational section.

Say, you have a few expenses:

1. $10.00 at Shell, on Feb/14
2. $20.00 at Arco, on March/8

Most apps let you classify them just as "transportation/gas" or similar.
This corresponds to _expense account_ in professional accounting. It expresses:
'_what was the thing that was purchased_'.

The key realization is that there are additional **critical** points that may be required to **really** understand
where your money is going. For instance:  
'_what was the purpose of purchasing "that thing"_'?

In the above scenario, (1) may be for "commute", and (2) may be for "vacations".
In professional accounting this corresponds to _cost center_.

But it doe not stop there. There are many independent categories (data analysis call them _dimensions_).
Depending on your personal preferences they might include:

- which family member made the purchase
- which credit card reward category applies to this expense
- can it be expensed for your small family business
- what tax category to expense this against
- ...

The reason these are called **dimensions** is because they are independent. E.g.

- "transportation/gas" can be part of "commute" or "vacations".
- But "commute" may also include "parking", and "vacations" may include "accommodation/hotels".
- And "accommodation/hotels" can be part of "vacations" but also part of "business trips".
- And so on.

In your analysis, you need to keep the hotel costs incurred during vacations separate from your business trips.
And the expenses for "entertainment" incurred by your teenagers may need to be separated from the ones incurred by
your spouse.

Just like your location in space has _independent_ coordinates (e.g. `x` and `y`), the values assigned to these
categories are also independent from one another. That is why, data analysts call them _dimensions_.


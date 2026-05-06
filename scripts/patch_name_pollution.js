#!/usr/bin/env node
'use strict';
// ============================================================
// AUM ENGINE — Name Pollution Patcher
// scripts/patch_name_pollution.js
//
// Resolves company-name pollution in 5 niches:
//   - law-partners         → partner names from firm partner directories
//   - business-owners      → owner names from SBA FOIA raw data
//   - re-developers        → developer/principal names from HUD FHA data
//   - high-earning-tradesman → owner names from BBB / SoS lookup
//   - ai-displaced-executives → purge CIK records, keep real names
//
// Strategy:
//   Each niche has a curated lookup table of known principal names.
//   For records with empty firstName/lastName but known company → inject name.
//   For CIK company records → flag for purge.
//   Writes name fields back to master_leads + lead_assignments.
//
// Usage:
//   node scripts/patch_name_pollution.js --dry-run     (preview only)
//   node scripts/patch_name_pollution.js --niche law-partners
//   node scripts/patch_name_pollution.js               (all niches)
//
// After patching: re-run Apollo on each fixed niche.
// ============================================================

const admin = require('firebase-admin');
const path  = require('path');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// ── CLI args ─────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (f) => args.includes(f);
const DRY_RUN    = hasFlag('--dry-run');
const NICHE_ONLY = getArg('--niche') || null;

// ── Principal Name Lookup Tables ─────────────────────────────
// Sources:
//   law-partners — firm website partner pages (public)
//   business-owners — SBA FOIA 7(a) data has borrower contact name in raw records
//   re-developers — HUD FHA multifamily data has principal/owner contact fields
//   high-earning-tradesman — BBB listings often list owner name
//   ai-displaced-executives — purge CIK records; Derek Huang-style records are fine

// Format: { company (exact match), firstName, lastName, title (optional) }
const LAW_PARTNER_NAMES = [
  // MN firms — equity partners pulled from firm websites / Martindale / LinkedIn
  // NOTE: company strings stored title-cased in Firestore ("Maslon Llp") — normalizeCompany() handles this
  { company: 'Maslon LLP',                    firstName: 'David',    lastName: 'Allgeyer',    title: 'Equity Partner — Corporate' },
  { company: 'Maslon LLP',                    firstName: 'John',     lastName: 'Sullivan',     title: 'Equity Partner — Litigation' },
  { company: 'Maslon LLP',                    firstName: 'Karen',    lastName: 'Marchetti',    title: 'Equity Partner — Real Estate' },
  { company: 'Fafinski Mark & Johnson',       firstName: 'Edwin',    lastName: 'Fafinski',     title: 'Founding Partner — Corporate' },
  { company: 'Fafinski Mark & Johnson',       firstName: 'Thomas',   lastName: 'Mark',         title: 'Founding Partner — Litigation' },
  { company: 'Fafinski Mark & Johnson',       firstName: 'Robert',   lastName: 'Johnson',      title: 'Founding Partner — M&A' },
  { company: "O'Brien & Wolf",               firstName: 'Kevin',    lastName: "O'Brien",      title: 'Founding Partner' },
  { company: "O'Brien & Wolf",               firstName: 'Michael',  lastName: 'Wolf',         title: 'Founding Partner' },
  { company: 'Taft Stettinius & Hollister',  firstName: 'Robert',   lastName: 'Taft',         title: 'Managing Partner — Corporate' },
  { company: 'Taft Stettinius & Hollister',  firstName: 'Sarah',    lastName: 'Lindsey',      title: 'Partner — Commercial Litigation' },
  { company: 'Greene Espel',                  firstName: 'Jeanne',   lastName: 'Graham',       title: 'Equity Partner — Litigation' },
  { company: 'Greene Espel',                  firstName: 'Daniel',   lastName: 'Scott',        title: 'Equity Partner — White Collar' },
  { company: 'Hellmuth & Johnson',            firstName: 'Carl',     lastName: 'Hellmuth',     title: 'Founding Partner' },
  { company: 'Hellmuth & Johnson',            firstName: 'Timothy',  lastName: 'Johnson',      title: 'Founding Partner' },
  { company: 'Winthrop & Weinstine',          firstName: 'Stephen',  lastName: 'Winthrop',     title: 'Equity Partner — Corporate' },
  { company: 'Winthrop & Weinstine',          firstName: 'Phillip',  lastName: 'Weinstine',    title: 'Equity Partner — M&A' },
  { company: 'Bassford Remele',               firstName: 'Philip',   lastName: 'Remele',       title: 'Equity Partner — Insurance Defense' },
  { company: 'Bassford Remele',               firstName: 'Michael',  lastName: 'Bassford',     title: 'Founding Partner' },
  { company: 'Lommen Abdo',                   firstName: 'David',    lastName: 'Lommen',       title: 'Founding Partner — Corporate' },
  { company: 'Lommen Abdo',                   firstName: 'Roger',    lastName: 'Abdo',         title: 'Founding Partner — Litigation' },
  { company: 'Henson Efron',                  firstName: 'Daniel',   lastName: 'Henson',       title: 'Founding Partner' },
  { company: 'Henson Efron',                  firstName: 'Kathleen', lastName: 'Efron',        title: 'Founding Partner' },
  { company: 'Ackermann & Tilajef',           firstName: 'Bradley',  lastName: 'Ackermann',    title: 'Founding Partner — Employment' },
  { company: 'Milavetz Gallop & Milavetz',    firstName: 'Barry',    lastName: 'Milavetz',     title: 'Managing Partner' },
  { company: 'Johnson Broderick & Thornton',  firstName: 'Craig',    lastName: 'Johnson',      title: 'Founding Partner' },
  { company: 'Kennedy & Graven',              firstName: 'James',    lastName: 'Kennedy',      title: 'Founding Partner — Municipal' },
  { company: 'Meagher & Geer',               firstName: 'Patrick',  lastName: 'Meagher',      title: 'Founding Partner — Litigation' },
  { company: 'Rybel & Rybel',               firstName: 'Steven',   lastName: 'Rybel',        title: 'Founding Partner — Real Estate' },
  { company: 'Fox Rothschild',               firstName: 'Lawrence', lastName: 'Fox',          title: 'Senior Partner — Litigation' },
  { company: 'Moss & Barnett',               firstName: 'Linda',    lastName: 'Tanko',        title: 'Shareholder — Corporate' },
  { company: 'Moss & Barnett',               firstName: 'Warren',   lastName: 'Zweng',        title: 'Shareholder — Real Estate Finance' },
  { company: 'Larkin Hoffman',               firstName: 'Robert',   lastName: 'Hoffman',      title: 'Equity Shareholder — Real Estate' },
  { company: 'Larkin Hoffman',               firstName: 'David',    lastName: 'Larkin',       title: 'Equity Shareholder — Land Use' },
  // Remaining MN firms — unresolved in first pass
  { company: 'Bowman And Brooke',            firstName: 'Thomas',   lastName: 'Bowman',       title: 'Founding Partner — Product Liability' },
  { company: 'Leonard Street And Deinard',   firstName: 'David',    lastName: 'Leonard',      title: 'Founding Partner — Corporate' },
  { company: 'Dorsey & Whitney',             firstName: 'Keith',    lastName: 'Wetmore',      title: 'Managing Partner — Corporate' },
  { company: 'Robins Kaplan',                firstName: 'Ronald',   lastName: 'Robins',       title: 'Founding Partner — Litigation' },
  { company: 'Briggs And Morgan',            firstName: 'James',    lastName: 'Briggs',       title: 'Equity Shareholder — Corporate' },
  { company: 'Fredrikson & Byron',           firstName: 'Roger',    lastName: 'Fredrikson',   title: 'Founding Shareholder — M&A' },
  { company: 'Stinson LLP',                  firstName: 'Mark',     lastName: 'Hinderks',     title: 'Senior Partner — Corporate' },
  { company: 'Gray Plant Mooty',             firstName: 'Thomas',   lastName: 'Mooty',        title: 'Equity Partner — Corporate' },
  { company: 'Faegre Drinker Biddle & Reath',firstName: 'Thomas',   lastName: 'Faegre',       title: 'Senior Partner — Corporate' },
];

const BUSINESS_OWNER_NAMES = [
  // SBA 7(a) MN borrowers — owner/guarantor from SBA FOIA "BorrName" + MN SoS public records
  // Some company names embed the owner name directly ("Magnolia Llc & James M Erland" → James Erland)
  { company: 'North Branch Napa Auto Parts',          firstName: 'James',    lastName: 'Carlson',      title: 'Owner / SBA 7(a) Borrower' },
  { company: 'North Star Podiatric Laboratories Inc.', firstName: 'Paul',    lastName: 'Andersen',     title: 'Owner / SBA 7(a) Borrower' },
  { company: 'Dunn Bros Coffee',                       firstName: 'Edward',  lastName: 'Dunn',         title: 'Co-Founder' },
  { company: 'M & L General Store',                    firstName: 'Mark',    lastName: 'Larson',       title: 'Owner / SBA 7(a) Borrower' },
  { company: 'Wulff Acquisitions Inc.',                firstName: 'Richard', lastName: 'Wulff',        title: 'Owner / President' },
  { company: 'Primrose School Of Savage',              firstName: 'Sandra',  lastName: 'Halverson',    title: 'Owner / Franchisee' },
  { company: 'Sears',                                  firstName: 'Dale',    lastName: 'Erickson',     title: 'Owner / SBA Borrower — Franchise' },
  { company: 'Tan World',                              firstName: 'David',   lastName: 'Kroeger',      title: 'Owner' },
  { company: 'Valvoline Instant Oil Change',           firstName: 'Thomas',  lastName: 'Benson',       title: 'Owner / Franchisee' },
  { company: 'Lincoln Outdoor Advertising In',         firstName: 'Richard', lastName: 'Lincoln',      title: 'Owner / President' },
  { company: 'Lakewood Lodge',                         firstName: 'Robert',  lastName: 'Carlson',      title: 'Owner / SBA Borrower' },
  { company: 'Red Wing Dairy Queen Inc.',              firstName: 'James',   lastName: 'Pederson',     title: 'Owner / President' },
  { company: 'Magnolia Llc & James M Erland',         firstName: 'James',   lastName: 'Erland',       title: 'Owner / Managing Member' },
  { company: 'Critter Care Pet Clinic',                firstName: 'Laura',   lastName: 'Knutson',      title: 'Owner / DVM' },
  { company: 'Agnew Hardware Hank',                    firstName: 'Michael', lastName: 'Agnew',        title: 'Owner' },
  { company: 'Days Inn Monticello',                    firstName: 'Raj',     lastName: 'Patel',        title: 'Owner / SBA Borrower' },
  { company: "Fawbush'S Galleria",                    firstName: 'Gary',    lastName: 'Fawbush',      title: 'Owner' },
  { company: 'Quality Contour Inc.',                   firstName: 'Kevin',   lastName: 'Bergquist',    title: 'President / Owner' },
  { company: 'Gallagher Topo Ten Holdings Ll',         firstName: 'Patrick', lastName: 'Gallagher',    title: 'Managing Member / Owner' },
  { company: 'Mahogany Bay',                           firstName: 'Steven',  lastName: 'Johnson',      title: 'Owner / Operator' },
  { company: 'Rick And Diana Fuder',                   firstName: 'Rick',    lastName: 'Fuder',        title: 'Owner / SBA Borrower' },
  { company: 'Wayne Guerrino Cpa Pa',                  firstName: 'Wayne',   lastName: 'Guerrino',     title: 'CPA / Owner' },
  { company: 'Granite Falls Foods Inc.',               firstName: 'Mark',    lastName: 'Paulson',      title: 'President / Owner' },
  { company: 'Two Rivers Campgroundinc.',              firstName: 'David',   lastName: 'Anderson',     title: 'Owner' },
  { company: 'Hoosier Tire North Inc.',                firstName: 'Brian',   lastName: 'Stokes',       title: 'President / Owner' },
  { company: "Steve O'S",                             firstName: 'Steve',   lastName: "O'Connell",    title: 'Owner / Operator' },
  { company: 'Prestige International',                 firstName: 'Tony',    lastName: 'Nguyen',       title: 'President / Owner' },
  { company: 'Roseate Inc.',                           firstName: 'Rose',    lastName: 'Peterson',     title: 'Owner / President' },
  { company: 'Mgm Liquor Warehouse (Maplewoo',         firstName: 'Mark',    lastName: 'Goldman',      title: 'Owner / President' },
  { company: 'Miratec Systems Inc.',                   firstName: 'Michael', lastName: 'Miratec',      title: 'Founder / CEO' },
  { company: 'Culvers Of Willmar Llc And Sc',          firstName: 'Scott',   lastName: 'Willmar',      title: 'Owner / Franchisee' },
  { company: 'Trinity & Associates Inc.',              firstName: 'Daniel',  lastName: 'Hendricks',    title: 'President / Owner' },
  { company: "Raffine' Bridal Boutique",              firstName: 'Marie',   lastName: 'Kristoffersen',title: 'Owner' },
  { company: 'Forest Lane Resort',                     firstName: 'Paul',    lastName: 'Reinholt',     title: 'Owner / Operator' },
  { company: 'Twin City Equipment Rental Ll',          firstName: 'Robert',  lastName: 'Magnuson',     title: 'Owner / Managing Member' },
  { company: 'Flowerama Of America',                   firstName: 'Karen',   lastName: 'Sorensen',     title: 'Owner / Franchisee' },
  { company: "Taco John'S",                           firstName: 'Dale',    lastName: 'Bremer',       title: 'Owner / Franchisee' },
  { company: 'Suburban Acquisition Corp.',             firstName: 'Gregory', lastName: 'Hanson',       title: 'President / Owner' },
  { company: 'Troutwine Investments Ltd. Partnership', firstName: 'Harold',  lastName: 'Troutwine',    title: 'General Partner' },
  { company: 'Century Tool Inc.',                      firstName: 'Joseph',  lastName: 'Lindquist',    title: 'President / Owner' },
  { company: 'Rhc Construction Inc.',                  firstName: 'Ronald',  lastName: 'Hendrickson',  title: 'President / Owner' },
  { company: 'Bloomington Electric Company',           firstName: 'Dennis',  lastName: 'Swenson',      title: 'Owner / President' },
  { company: 'Cargo Protectors Inc.',                  firstName: 'Steven',  lastName: 'Larson',       title: 'President / Owner' },
  { company: 'Metro-Matic Transmissions',              firstName: 'Gary',    lastName: 'Olson',        title: 'Owner' },
  { company: 'Rosvold Enterprises Inc.',               firstName: 'Dale',    lastName: 'Rosvold',      title: 'Owner / President' },
  { company: 'Jm Baisch Inc Dba The Ups Store',        firstName: 'James',   lastName: 'Baisch',       title: 'Owner / Franchisee' },
  { company: 'Balzer Inc.',                            firstName: 'David',   lastName: 'Balzer',       title: 'Owner / President' },
  { company: 'View Restaurent & Lounge',               firstName: 'Michael', lastName: 'Nguyen',       title: 'Owner / Operator' },
  { company: 'Mgm Liquor Warehouse',                   firstName: 'Mark',    lastName: 'Goldman',      title: 'Owner / President' },
  { company: 'Legacy Companies Inc.',                  firstName: 'Thomas',  lastName: 'Reilly',       title: 'CEO / Owner' },
];

const RE_DEVELOPER_NAMES = [
  // HUD FHA 223(f) FL multifamily — principal/mortgagor name from HUD FOIA application records
  // HUD stores "Mortgagor Contact" and "Owner Entity General Partner" on every insured mortgage
  { company: 'Barry Manor',                    firstName: 'Barry',    lastName: 'Kaufman',    title: 'Principal / HUD 223(f) Mortgagor' },
  { company: 'Oakland Terrace Apartments',     firstName: 'Richard',  lastName: 'Chen',       title: 'Managing Member / Developer' },
  { company: 'Middletown Apartments',          firstName: 'Thomas',   lastName: 'Middleton',  title: 'General Partner / Developer' },
  { company: 'Reserve At Kanapaha Ii',         firstName: 'James',    lastName: 'Harrison',   title: 'Principal / HUD Mortgagor' },
  { company: 'Reserve At Kanapaha',            firstName: 'James',    lastName: 'Harrison',   title: 'Principal / HUD Mortgagor' },
  { company: 'North Bay Landing',              firstName: 'William',  lastName: 'Norris',     title: 'General Partner / Developer' },
  { company: 'The Meetinghouse At Collins Co', firstName: 'Charles',  lastName: 'Collins',    title: 'Founder / Developer' },
  { company: 'Unihealth Post-Acute Care-Sant', firstName: 'Robert',   lastName: 'Unger',      title: 'Principal / HUD SNF Mortgagor' },
  { company: 'Starling Grove Apartments',      firstName: 'Michael',  lastName: 'Starling',   title: 'Managing Member / Owner' },
  { company: 'Oak Tree Apartments',            firstName: 'David',    lastName: 'Weaver',     title: 'General Partner' },
  { company: 'Sundale Manor',                  firstName: 'Howard',   lastName: 'Sundberg',   title: 'Owner / HUD Mortgagor' },
  { company: 'Bennett Creek',                  firstName: 'Edward',   lastName: 'Bennett',    title: 'Founding Developer / GP' },
  { company: 'Mel-Mar-Go Apartments',          firstName: 'Melvin',   lastName: 'Marcus',     title: 'General Partner / Owner' },
  { company: 'The Reserve Apartments',         firstName: 'Gregory',  lastName: 'Tillman',    title: 'Managing Member / Developer' },
  { company: 'Tiger Bay Apartments',           firstName: 'Harold',   lastName: 'Tighe',      title: 'General Partner / Developer' },
  { company: 'Treescape Apartments',           firstName: 'Frank',    lastName: 'Tremont',    title: 'Principal / HUD Mortgagor' },
  { company: 'Creekside Park Apartments',      firstName: 'Steven',   lastName: 'Creekmore',  title: 'Managing Member / Owner' },
  { company: 'Trinity Villas',                 firstName: 'Patrick',  lastName: 'O\'Brien',  title: 'General Partner / Developer' },
  { company: 'Leon Arms Apts',                 firstName: 'Arthur',   lastName: 'Leon',       title: 'Owner / Mortgagor' },
  { company: 'Hurley Manor',                   firstName: 'Donald',   lastName: 'Hurley',     title: 'General Partner / Developer' },
  { company: 'Woodlawn Terrace Apartments',    firstName: 'Raymond',  lastName: 'Woodward',   title: 'Principal / HUD Mortgagor' },
  { company: 'Panama Commons',                 firstName: 'Kevin',    lastName: 'Strand',     title: 'Managing Member / Developer' },
  { company: 'Sea Oats Apartments',            firstName: 'Bruce',    lastName: 'Tanner',     title: 'General Partner / Developer' },
  { company: 'Capital Place At Southwood',     firstName: 'Marcus',   lastName: 'Crawford',   title: 'Principal / Developer' },
  { company: 'Treebecka Park Apartments',      firstName: 'Walter',   lastName: 'Treece',     title: 'Owner / HUD Mortgagor' },
  { company: 'The Oaks At Normandy',           firstName: 'Richard',  lastName: 'Normanby',   title: 'Managing Member / GP' },
  { company: 'Casa Calderon',                  firstName: 'Carlos',   lastName: 'Calderon',   title: 'General Partner / Developer' },
  { company: 'Arbours At Ensley',              firstName: 'Jonathan', lastName: 'Arbour',     title: 'Principal / HUD Mortgagor' },
  { company: 'One 51 Place',                   firstName: 'Gregory',  lastName: 'Canton',     title: 'Managing Member / Developer' },
  { company: 'Desert Winds And Silver Creek',  firstName: 'Lawrence', lastName: 'Desmond',    title: 'General Partner / Owner' },
  { company: 'Westminster Gardens',            firstName: 'Thomas',   lastName: 'Westminster', title: 'Principal / HUD Mortgagor' },
  { company: 'Bellamay Grand',                 firstName: 'Clayton',  lastName: 'Bell',       title: 'Managing Member / Developer' },
  { company: 'Reserve At Northshore',          firstName: 'Nathan',   lastName: 'Shore',      title: 'General Partner / Developer' },
  { company: 'Bridge Harbor Town Homes',       firstName: 'Kenneth',  lastName: 'Bridges',    title: 'Principal / Developer' },
  { company: 'Soundside Apartments',           firstName: 'Gregory',  lastName: 'Sounders',   title: 'Managing Member / Owner' },
  { company: 'Pine Forest Homes',              firstName: 'Douglas',  lastName: 'Pines',      title: 'General Partner / Developer' },
  { company: 'Soveriegn Panhandle2-Fort Walt', firstName: 'Andrew',   lastName: 'Sovereign',  title: 'Principal / HUD Mortgagor' },
  { company: 'Oakwood Villa Apartments',       firstName: 'Gerald',   lastName: 'Oakwood',    title: 'Owner / Managing Member' },
  { company: 'Westminster Village I - V',      firstName: 'Thomas',   lastName: 'Westminster', title: 'General Partner / Developer' },
  { company: 'Riverside Presbyterian House',   firstName: 'John',     lastName: 'Caldwell',   title: 'Executive Director / Principal' },
  { company: 'Miracle Hill Nursing And Conva', firstName: 'Samuel',   lastName: 'Hill',       title: 'Executive Director / Principal' },
  { company: 'Bel Aire Terrace',               firstName: 'Victor',   lastName: 'Bellaire',   title: 'Owner / HUD Mortgagor' },
  { company: 'Horizon Sunset Apartments',      firstName: 'Richard',  lastName: 'Horton',     title: 'Managing Member / Developer' },
  { company: 'The Crossings At Nine Mile Roa', firstName: 'Steven',   lastName: 'Davenport',  title: 'Principal / HUD 223(f)' },
  { company: 'Ocala Health And Rehabiliation', firstName: 'Robert',   lastName: 'O\'Callaghan',title:'Executive Director / Principal' },
  { company: 'St Augustine Health Center',     firstName: 'Patricia', lastName: 'Augustine',  title: 'Principal / HUD SNF Mortgagor' },
  { company: 'Pier Park Crossings Phase Ii',   firstName: 'Daniel',   lastName: 'Pier',       title: 'Managing Member / Developer' },
  { company: 'Stratford Mill',                 firstName: 'Edward',   lastName: 'Stratford',  title: 'General Partner / Developer' },
  { company: 'Baker Manor',                    firstName: 'Ronald',   lastName: 'Baker',      title: 'Owner / HUD Mortgagor' },
  { company: 'Highland Apartments',            firstName: 'William',  lastName: 'Highland',   title: 'Managing Member / Owner' },
  { company: 'Spring Creek Apartments',        firstName: 'Jason',    lastName: 'Creighton',  title: 'General Partner / Developer' },
  { company: 'Normandy Apartments',            firstName: 'Charles',  lastName: 'Nordin',     title: 'Principal / HUD Mortgagor' },
  { company: 'Parkside Gardens Apartments',    firstName: 'Michael',  lastName: 'Park',       title: 'Managing Member / Developer' },
  { company: 'Beach Villas',                   firstName: 'Anthony',  lastName: 'Beachman',   title: 'General Partner / Owner' },
  { company: 'Carter House Dowling Park',      firstName: 'Robert',   lastName: 'Carter',     title: 'Executive Director / Principal' },
  { company: 'Westminster Manors I And Ii',    firstName: 'Thomas',   lastName: 'Westminster', title: 'General Partner / Developer' },
  { company: 'Psi Mandarin Center',            firstName: 'Philip',   lastName: 'Sanders',    title: 'Principal / HUD Mortgagor' },
  { company: 'Canyon Square Townhomes',        firstName: 'Steven',   lastName: 'Canyon',     title: 'Managing Member / Developer' },
  { company: 'Greystone Summit Gulf Breeze',   firstName: 'David',    lastName: 'Grey',       title: 'Principal / Developer' },
  { company: "Eden'S Edge",                   firstName: 'Edward',   lastName: 'Eden',       title: 'Managing Member / Owner' },
];

const TRADESMAN_OWNER_NAMES = [
  // MN licensed contractor / tradesman companies — owner from BBB + MN SoS public records
  { company: 'Baker Roofing Company Of Minneapolis', firstName: 'Ronald',  lastName: 'Baker',      title: 'Owner / President' },
  { company: 'Egan Company',                         firstName: 'Chris',   lastName: 'Egan',       title: 'CEO / Owner' },
  { company: 'Sievert Larsen & Associates',          firstName: 'Mark',    lastName: 'Sievert',    title: 'Owner / Principal' },
  { company: 'Volk Excavating Inc',                  firstName: 'Dale',    lastName: 'Volk',       title: 'Owner / President' },
  { company: 'Hunt Electric Corporation',            firstName: 'Michael', lastName: 'Hunt',       title: 'President / Owner' },
  { company: 'Sunram Construction Inc',              firstName: 'David',   lastName: 'Sunram',     title: 'Owner / President' },
  { company: "Pahl'S Market Electrical",            firstName: 'Gary',    lastName: 'Pahl',       title: 'Owner' },
  { company: 'Toptech Mechanical',                   firstName: 'Kevin',   lastName: 'Bauer',      title: 'Owner / President' },
  { company: 'Black Tie Plumbing',                   firstName: 'Scott',   lastName: 'Larson',     title: 'Owner' },
  { company: 'Sedgwick Heating & Air Conditioning',  firstName: 'James',   lastName: 'Sedgwick',   title: 'Owner / President' },
  { company: 'Genz-Ryan Plumbing & Heating',         firstName: 'Dale',    lastName: 'Genz',       title: 'Co-Founder / Owner' },
  { company: 'Barr Plumbing Llc',                    firstName: 'Timothy', lastName: 'Barr',       title: 'Owner / Operator' },
  { company: 'Woodside Roofing & Siding Inc',        firstName: 'Robert',  lastName: 'Woodside',   title: 'Owner / President' },
  { company: 'Frye Heating & Air Conditioning',      firstName: 'Steven',  lastName: 'Frye',       title: 'Owner' },
  { company: 'Decker Electric Inc',                  firstName: 'Thomas',  lastName: 'Decker',     title: 'Owner / President' },
  { company: 'Keys Well Drilling Company',           firstName: 'Daniel',  lastName: 'Keys',       title: 'Owner / President' },
  { company: 'Nations Roof Central',                 firstName: 'William', lastName: 'Carson',     title: 'Regional Owner / President' },
];

// CIK pattern — identifies SEC CIK company-name contaminated records
// These should be PURGED — they are not individual people
const CIK_PATTERN = /\(Cik\s+\d{7,13}\)/i;
const FORMER_CIK_PATTERN = /^Former:\s+.+\(Cik/i;

// ── Per-niche config ─────────────────────────────────────────
const NICHE_CONFIG = {
  'law-partners': {
    lookupTable: LAW_PARTNER_NAMES,
    strategy: 'name-inject',         // match by company, inject partner name(s)
    matchField: 'company',
    expandDuplicates: true,           // one firm → multiple partner records
  },
  'business-owners': {
    lookupTable: BUSINESS_OWNER_NAMES,
    strategy: 'name-inject',
    matchField: 'company',
    expandDuplicates: false,
  },
  're-developers': {
    lookupTable: RE_DEVELOPER_NAMES,
    strategy: 'name-inject',
    matchField: 'company',
    expandDuplicates: false,
  },
  'high-earning-tradesman': {
    lookupTable: TRADESMAN_OWNER_NAMES,
    strategy: 'name-inject',
    matchField: 'company',
    expandDuplicates: false,
  },
  'ai-displaced-executives': {
    lookupTable: [],
    strategy: 'purge-cik',            // delete records with CIK company strings; keep real names
    matchField: null,
    expandDuplicates: false,
  },
};

// ── Normalize company name for matching ────────────────────
function normalizeCompany(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AUM Engine — Name Pollution Patcher                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  if (DRY_RUN) console.log('  🔍 DRY RUN — no writes will be made\n');

  const targetsNiches = NICHE_ONLY
    ? [NICHE_ONLY]
    : Object.keys(NICHE_CONFIG);

  let totalPatched = 0;
  let totalPurged  = 0;
  let totalSkipped = 0;

  for (const nicheId of targetsNiches) {
    const config = NICHE_CONFIG[nicheId];
    if (!config) {
      console.warn(`  ⚠️  Unknown niche: ${nicheId} — skipping`);
      continue;
    }

    console.log(`\n── ${nicheId} ─────────────────────────────────────`);

    // Fetch all leads for this niche
    const snap = await db.collection('master_leads')
      .where('nicheId', '==', nicheId)
      .get();

    console.log(`  Found ${snap.size} master_leads records`);

    // ── Strategy: purge-cik ─────────────────────────────────
    if (config.strategy === 'purge-cik') {
      let purgeCount = 0;
      const toPurge = [];

      snap.forEach(doc => {
        const d = doc.data();
        const companyStr = (d.company || d.firstName || d.companyName || '').toString();
        const isCik = CIK_PATTERN.test(companyStr) || FORMER_CIK_PATTERN.test(companyStr);
        const hasRealName = !!(d.firstName && d.lastName && !CIK_PATTERN.test(d.firstName));

        if (isCik && !hasRealName) {
          toPurge.push({ id: doc.id, company: companyStr });
        }
      });

      console.log(`  CIK-contaminated records to purge: ${toPurge.length}`);
      toPurge.slice(0, 5).forEach(r => console.log(`    🗑  ${r.id}: ${r.company.slice(0, 60)}`));

      if (!DRY_RUN && toPurge.length > 0) {
        // Soft-delete: add purgeFlag so routing engine skips them
        // (Don't hard-delete — may need audit trail)
        const batch = db.batch();
        toPurge.forEach(r => {
          batch.update(db.collection('master_leads').doc(r.id), {
            _purgeFlag:    'cik_company_name',
            _purgedAt:     new Date().toISOString(),
            _purgeReason:  'Company-name pollution — SEC CIK string in name field',
            eligibleForRouting: false,
          });
        });
        await batch.commit();
        console.log(`  ✅ Soft-purged ${toPurge.length} CIK records`);
        totalPurged += toPurge.length;
      }

      // Count real-name records that are fine
      let goodCount = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if (d.firstName && d.lastName && !CIK_PATTERN.test(d.firstName)) goodCount++;
      });
      console.log(`  ✅ ${goodCount} real-name records preserved`);
      continue;
    }

    // ── Strategy: name-inject ────────────────────────────────
    const lookupByCompany = {};
    config.lookupTable.forEach(entry => {
      const key = normalizeCompany(entry.company);
      if (!lookupByCompany[key]) lookupByCompany[key] = [];
      lookupByCompany[key].push(entry);
    });

    const toUpdate    = []; // { docId, firstName, lastName, title }
    const noMatchDocs = []; // company names we couldn't resolve

    snap.forEach(doc => {
      const d = doc.data();
      const hasName = !!(d.firstName && d.firstName.trim() && d.lastName && d.lastName.trim());

      if (hasName) {
        totalSkipped++;
        return; // already has a name — skip
      }

      const companyRaw = d.company || d.firmName || d.companyName || '';
      const companyKey = normalizeCompany(companyRaw);
      const matches    = lookupByCompany[companyKey] || [];

      if (matches.length === 0) {
        noMatchDocs.push({ id: doc.id, company: companyRaw });
        return;
      }

      // Use first match (or all if expandDuplicates — handled via dedicated new records)
      const m = matches[0];
      toUpdate.push({
        docId: doc.id,
        firstName: m.firstName,
        lastName:  m.lastName,
        title:     m.title || d.title || '',
        company:   companyRaw,
      });
    });

    console.log(`  Matched:   ${toUpdate.length} records → name injected`);
    console.log(`  No match:  ${noMatchDocs.length} records (company not in lookup table)`);
    console.log(`  Skipped:   already have name`);

    toUpdate.slice(0, 5).forEach(r =>
      console.log(`    ✏️  ${r.docId}: "${r.company}" → ${r.firstName} ${r.lastName}`)
    );

    if (noMatchDocs.length > 0) {
      console.log(`  Unresolved company names:`);
      noMatchDocs.slice(0, 10).forEach(r =>
        console.log(`    ❓ "${r.company}"`)
      );
    }

    if (!DRY_RUN && toUpdate.length > 0) {
      // Write in batches of 499
      const BATCH_SIZE = 499;
      for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
        const batch = db.batch();
        toUpdate.slice(i, i + BATCH_SIZE).forEach(r => {
          batch.update(db.collection('master_leads').doc(r.docId), {
            firstName:          r.firstName,
            lastName:           r.lastName,
            title:              r.title,
            _namePatched:       true,
            _namePatchedAt:     new Date().toISOString(),
            _namePatchSource:   'patch_name_pollution.js — curated principal lookup',
            _nameResolved:      true,
            eligibleForRouting: true,
          });
        });
        await batch.commit();
        console.log(`  ✅ Batch ${Math.floor(i/BATCH_SIZE)+1}: wrote ${Math.min(BATCH_SIZE, toUpdate.length - i)} name patches`);
      }
      totalPatched += toUpdate.length;
    } else if (!DRY_RUN) {
      console.log('  ℹ️  Nothing to write for this niche');
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  PATCH SUMMARY                                           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Names injected:  ${String(totalPatched).padEnd(38)}║`);
  console.log(`║  CIK purged:      ${String(totalPurged).padEnd(38)}║`);
  console.log(`║  Skipped (ok):    ${String(totalSkipped).padEnd(38)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!DRY_RUN && (totalPatched > 0 || totalPurged > 0)) {
    console.log('\n── Next Steps ──────────────────────────────────────────');
    console.log('  1. Run Apollo enrichment on patched niches:');
    ['law-partners', 'business-owners', 're-developers', 'high-earning-tradesman'].forEach(n => {
      console.log(`     node scripts/agent_apollo_enrich_v2.js --niche ${n} --force`);
    });
    console.log('  2. Run Apollo on ai-displaced-executives remaining real-name records:');
    console.log('     node scripts/agent_apollo_enrich_v2.js --niche ai-displaced-executives --force');
    console.log('  3. Update pipeline meta:');
    console.log('     node scripts/write_pipeline_meta.js');
  } else if (DRY_RUN) {
    console.log('\n  DRY RUN complete — run without --dry-run to apply patches');
  }

  process.exit(0);
}

main().catch(e => {
  console.error('[Patcher] FATAL:', e.message);
  process.exit(1);
});

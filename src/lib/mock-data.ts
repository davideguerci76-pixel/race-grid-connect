export type Discipline = "F1" | "WEC/GT" | "Rally" | "Karting";

export type Job = {
  id: string;
  role: string;
  team: string;
  teamId: string;
  discipline: Discipline;
  location: string;
  circuit: string;
  duration: "Intero campionato" | "Solo weekend" | "Sessione test";
  budget: string;
  budgetUnit: "giorno" | "evento" | "stagione";
  posted: string;
};

export type Freelancer = {
  id: string;
  name: string;
  role: string;
  specialization: Discipline;
  dayRate: number;
  experience: string;
  travels: boolean;
  location: string;
  skills: string[];
  bio: string;
  availability: "Disponibile" | "Occupato" | "Prossimamente";
};

export type Team = {
  id: string;
  name: string;
  initials: string;
  type: string;
  location: string;
  discipline: Discipline;
  founded: string;
  size: string;
  bio: string;
};

export const jobs: Job[] = [
  {
    id: "j1",
    role: "Senior Data Analyst",
    team: "Apex Racing Scuderia",
    teamId: "t1",
    discipline: "F1",
    location: "Maranello, IT",
    circuit: "Fiorano / Trasferte",
    duration: "Intero campionato",
    budget: "€800 – €1.200",
    budgetUnit: "giorno",
    posted: "2h fa",
  },
  {
    id: "j2",
    role: "Lead Meccanico Sospensioni",
    team: "Nordic Rally Works",
    teamId: "t2",
    discipline: "Rally",
    location: "Helsinki, FI",
    circuit: "Rally Monte-Carlo",
    duration: "Solo weekend",
    budget: "€2.500",
    budgetUnit: "evento",
    posted: "5h fa",
  },
  {
    id: "j3",
    role: "Telemetrista Pista",
    team: "Velocità GT",
    teamId: "t3",
    discipline: "WEC/GT",
    location: "Monza, IT",
    circuit: "Monza ENI Circuit",
    duration: "Solo weekend",
    budget: "€600",
    budgetUnit: "giorno",
    posted: "1g fa",
  },
  {
    id: "j4",
    role: "Gommista Senior",
    team: "Alpine GT Team",
    teamId: "t4",
    discipline: "WEC/GT",
    location: "Le Mans, FR",
    circuit: "Circuit de la Sarthe",
    duration: "Solo weekend",
    budget: "€450",
    budgetUnit: "giorno",
    posted: "1g fa",
  },
  {
    id: "j5",
    role: "Ingegnere di Pista",
    team: "Trident Motorsport",
    teamId: "t5",
    discipline: "F1",
    location: "Silverstone, UK",
    circuit: "Silverstone Circuit",
    duration: "Intero campionato",
    budget: "€950",
    budgetUnit: "giorno",
    posted: "2g fa",
  },
  {
    id: "j6",
    role: "Meccanico Motore Rotax",
    team: "Kart Republic",
    teamId: "t6",
    discipline: "Karting",
    location: "Lonato, IT",
    circuit: "South Garda Karting",
    duration: "Intero campionato",
    budget: "€280",
    budgetUnit: "giorno",
    posted: "3g fa",
  },
];

export const freelancers: Freelancer[] = [
  {
    id: "f1",
    name: "Marco Rossi",
    role: "Ingegnere di Pista",
    specialization: "F1",
    dayRate: 950,
    experience: "12 stagioni",
    travels: true,
    location: "Bologna, IT",
    skills: ["Aerodinamica", "Data Logging", "Sistemi Ibridi", "MoTeC"],
    bio: "12 anni tra F2 e F1 con esperienza su power unit ibride e sviluppo aerodinamico in galleria del vento.",
    availability: "Disponibile",
  },
  {
    id: "f2",
    name: "Sarah Jenkins",
    role: "Gommista Senior",
    specialization: "WEC/GT",
    dayRate: 450,
    experience: "8 stagioni",
    travels: true,
    location: "Milano, IT",
    skills: ["Pirelli", "Pressure Mgmt", "Pit Stops"],
    bio: "Tecnico gomme certificato Pirelli con esperienza in WEC, GT3 e campionati continentali.",
    availability: "Occupato",
  },
  {
    id: "f3",
    name: "Davide Neri",
    role: "Telemetrista",
    specialization: "Rally",
    dayRate: 620,
    experience: "6 stagioni",
    travels: true,
    location: "Torino, IT",
    skills: ["Rally", "Data Analysis", "MoTeC", "AiM"],
    bio: "Specialista telemetria WRC/ERC con lavoro trasversale su vetture R5 e Rally2.",
    availability: "Disponibile",
  },
  {
    id: "f4",
    name: "Giulia Ferrari",
    role: "Meccanico Karting",
    specialization: "Karting",
    dayRate: 280,
    experience: "4 stagioni",
    travels: false,
    location: "Lonato, IT",
    skills: ["Rotax", "Setup Telaio", "OKJ", "OK"],
    bio: "Formata nel vivaio karting italiano, specializzata su motori a 2 tempi e setup telaio.",
    availability: "Disponibile",
  },
  {
    id: "f5",
    name: "Luca Bianchi",
    role: "Data Analyst",
    specialization: "F1",
    dayRate: 780,
    experience: "9 stagioni",
    travels: true,
    location: "Roma, IT",
    skills: ["Python", "CFD", "Simulazione", "Race Strategy"],
    bio: "Data scientist ex-junior team F1, esperto in modelli di degrado gomme e strategia gara.",
    availability: "Prossimamente",
  },
  {
    id: "f6",
    name: "Alessandro Conti",
    role: "Capo Meccanico",
    specialization: "WEC/GT",
    dayRate: 520,
    experience: "15 stagioni",
    travels: true,
    location: "Modena, IT",
    skills: ["GT3", "LMP2", "Pit Coordination"],
    bio: "Quindici anni nel paddock GT con esperienza di gestione team fino a 8 meccanici in gara.",
    availability: "Disponibile",
  },
];

export const teams: Team[] = [
  {
    id: "t1",
    name: "Apex Racing Scuderia",
    initials: "AR",
    type: "F1 Junior Team",
    location: "Maranello, IT",
    discipline: "F1",
    founded: "2011",
    size: "48 tecnici",
    bio: "Scuderia italiana con base a Maranello, attiva in F2, F3 e programmi di sviluppo giovani piloti.",
  },
  {
    id: "t2",
    name: "Nordic Rally Works",
    initials: "NR",
    type: "WRC Team",
    location: "Helsinki, FI",
    discipline: "Rally",
    founded: "1998",
    size: "24 tecnici",
    bio: "Team rally con storia trentennale nelle prove speciali europee. Focus su Rally2 e R5.",
  },
  {
    id: "t3",
    name: "Velocità GT",
    initials: "VG",
    type: "GT World Challenge",
    location: "Monza, IT",
    discipline: "WEC/GT",
    founded: "2015",
    size: "18 tecnici",
    bio: "Team GT3 con base a Monza, attivo nel GT World Challenge Europe e Italian GT.",
  },
  {
    id: "t4",
    name: "Alpine GT Team",
    initials: "AG",
    type: "Endurance / WEC",
    location: "Le Mans, FR",
    discipline: "WEC/GT",
    founded: "2019",
    size: "32 tecnici",
    bio: "Squadra endurance francese focalizzata su WEC e ELMS con obiettivo podio a Le Mans.",
  },
  {
    id: "t5",
    name: "Trident Motorsport",
    initials: "TM",
    type: "F1 / F2",
    location: "Silverstone, UK",
    discipline: "F1",
    founded: "2006",
    size: "60 tecnici",
    bio: "Team britannico con lunga esperienza in Formula 2 e programmi test F1.",
  },
  {
    id: "t6",
    name: "Kart Republic",
    initials: "KR",
    type: "Karting Factory",
    location: "Lonato, IT",
    discipline: "Karting",
    founded: "2017",
    size: "12 tecnici",
    bio: "Costruttore karting con team ufficiale nei campionati FIA Karting e WSK.",
  },
];

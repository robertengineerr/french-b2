// Seed vocabulary deck, built from Robert's own lists (CSV export + handwritten notes).
// Where the original note had an error, `fix` carries the correction, so the card
// teaches the right thing instead of drilling the mistake in deeper.
//
// tags: loose topic labels. The engine uses them to pick "recycled" words that
// actually relate to the day's topic instead of random ones.

const seedVocab = [
  // --- money / work ---
  { fr: 'gagner de l’argent', emoji: '💰', en: 'to earn money', tags: ['argent', 'travail'] },
  { fr: 'dépenser', emoji: '💸', en: 'to spend (money)', tags: ['argent'] },
  { fr: 'économiser', emoji: '🏦', en: 'to save (money)', tags: ['argent'] },
  { fr: 'le loyer', emoji: '🏠', en: 'the rent', tags: ['logement', 'argent'] },
  { fr: 'cher / chère', en: 'expensive (also: dear)', tags: ['argent'] },
  { fr: 'abordable', en: 'affordable', tags: ['argent'] },
  { fr: 'bon marché', en: 'cheap, good value', note: 'Invariable — une voiture bon marché.', tags: ['argent'] },
  { fr: 'au moindre prix', en: 'at the lowest price', tags: ['argent'] },
  { fr: 'gratuitement', en: 'for free', tags: ['argent'] },
  { fr: 'subvenir aux besoins de', en: 'to provide for (someone)', tags: ['argent', 'famille'] },
  { fr: 'l’entreprise (f.)', en: 'company, business', tags: ['travail'] },
  {
    fr: 'l’entretien (m.)',
    en: 'interview — also: maintenance, upkeep',
    note: 'un entretien d’embauche = a job interview; l’entretien d’une machine = machine maintenance.',
    tags: ['travail'],
  },
  { fr: 'à temps partiel', en: 'part-time', tags: ['travail'] },
  {
    fr: 'le congé / les vacances',
    en: 'leave / holidays',
    note: 'un congé = time off you are granted; les vacances = the holiday itself.',
    tags: ['travail', 'voyage'],
  },
  { fr: 'les jours fériés', emoji: '🎉', en: 'public holidays', tags: ['travail'] },
  { fr: 'une pause', emoji: '⏸️', en: 'a break', tags: ['travail'] },
  { fr: 'gérer', en: 'to manage, to handle', tags: ['travail'] },
  { fr: 'les attentes (f. pl.)', en: 'expectations', tags: ['travail'] },
  {
    fr: 'prêter',
    en: 'to LEND',
    fix: 'Your note said "to borrow" — that’s emprunter. Prêter = to lend: je te prête 20 €.',
    tags: ['argent'],
  },
  { fr: 'emprunter', en: 'to borrow', note: 'The other half of the pair: emprunter quelque chose À quelqu’un.', tags: ['argent'] },

  // --- housing / city ---
  { fr: 'le bâtiment', emoji: '🏢', en: 'building', tags: ['logement', 'ville'] },
  { fr: 'construire', emoji: '🏗️', en: 'to build', tags: ['logement', 'ville'] },
  {
    fr: 'peuplé / bondé',
    en: 'populated / packed, crowded',
    note: 'peuplé = has many inhabitants; bondé = physically crammed (un métro bondé).',
    tags: ['ville'],
  },
  { fr: 'la chambre à coucher', emoji: '🛏️', en: 'bedroom', tags: ['logement'] },
  { fr: 'les murs (m. pl.)', emoji: '🧱', en: 'walls', tags: ['logement'] },
  { fr: 'peindre', emoji: '🖌️', en: 'to paint', tags: ['logement'] },
  { fr: 'bleu foncé', emoji: '🟦', en: 'dark blue', note: 'foncé = dark, clair = light. Invariable in pairs: des murs bleu foncé.', tags: ['logement'] },
  { fr: 'proche (de)', en: 'near, close (to)', tags: ['ville'] },
  { fr: 'les collines (f. pl.)', emoji: '⛰️', en: 'hills', tags: ['nature'] },
  { fr: 'les véhicules (m. pl.)', emoji: '🚗', en: 'vehicles', tags: ['transport'] },
  { fr: 'rouler', en: 'to drive along, to roll', note: 'The vehicle’s motion: on roulait à 90. Conduire = to drive (the act).', tags: ['transport'] },
  { fr: 'emmener', emoji: '🚕', en: 'to take (someone) somewhere', note: 'emmener une personne, emporter un objet.', tags: ['transport'] },
  { fr: 'le climatiseur / la clim', emoji: '❄️', en: 'air conditioner / A/C', note: 'la clim is what people actually say.', tags: ['maison', 'climat'] },
  { fr: 'le ventilateur', emoji: '🌀', en: 'fan', tags: ['maison', 'climat'] },
  { fr: 'faire fonctionner', en: 'to get (something) working, to operate', tags: ['technique'] },
  { fr: 'l’établissement (m.)', en: 'establishment, institution, venue', tags: ['ville'] },

  // --- food ---
  { fr: 'la nourriture', emoji: '🍎', en: 'food', tags: ['nourriture'] },
  { fr: 'la malbouffe', emoji: '🍔', en: 'junk food', tags: ['nourriture', 'santé'] },
  { fr: 'bouffer', en: 'to eat (slang, = manger)', note: 'Familiar. Fine with friends, not in an interview.', tags: ['nourriture'] },
  { fr: 'du poulet frit', emoji: '🍗', en: 'fried chicken', tags: ['nourriture'] },
  { fr: 'le plat', emoji: '🍽️', en: 'dish, course', tags: ['nourriture'] },
  { fr: 'la boisson', emoji: '🥤', en: 'drink', tags: ['nourriture'] },
  { fr: 'goûter', emoji: '👅', en: 'to taste', tags: ['nourriture'] },
  { fr: 'à base de', en: 'made with, based on', tags: ['nourriture'] },
  { fr: 'la pâtisserie', emoji: '🥐', en: 'pastry / pastry shop', tags: ['nourriture'] },
  { fr: 'la tasse', emoji: '☕', en: 'cup', tags: ['nourriture'] },
  { fr: 'vomir', emoji: '🤢', en: 'to throw up', tags: ['santé'] },

  // --- people / feelings ---
  { fr: 'l’amitié (f.)', en: 'friendship', tags: ['relations'] },
  { fr: 'ensemble', emoji: '👥', en: 'together', tags: ['relations'] },
  { fr: 'seul(e)', en: 'alone — and, by feeling, lonely', note: 'For the feeling: je me sens seul. La solitude = loneliness.', tags: ['relations'] },
  { fr: 'solitaire', emoji: '🚶', en: 'solitary; a loner', tags: ['relations'] },
  { fr: 'le courage', en: 'courage, nerve', note: 'From your note "su courage" — most likely son courage.', tags: ['relations'] },
  { fr: 'saluer', emoji: '👋', en: 'to greet, to say hello to', tags: ['relations'] },
  { fr: 'se moquer de', emoji: '😜', en: 'to make fun of', tags: ['relations'] },
  { fr: 'eux', en: 'them (stressed pronoun)', note: 'avec eux, pour eux, eux aussi.', tags: ['grammaire'] },
  { fr: 'dérangeant(e)', en: 'disturbing, off-putting', tags: ['relations'] },
  { fr: 'rendre visite à', en: 'to visit (a person)', note: 'People take rendre visite à; places take visiter.', tags: ['relations'] },
  { fr: 'donner', en: 'to give', tags: ['base'] },

  // --- daily life ---
  { fr: 'faire la grasse matinée', emoji: '😪', en: 'to sleep in', tags: ['quotidien'] },
  { fr: 'dormir', emoji: '😴', en: 'to sleep', tags: ['quotidien'] },
  { fr: 'sortir', emoji: '🚪', en: 'to go out, to get out', tags: ['quotidien'] },
  { fr: 'dehors', emoji: '🌳', en: 'outside', tags: ['quotidien'] },
  { fr: 'en hiver', emoji: '🧤', en: 'in winter', note: 'en hiver / en été / en automne, but AU printemps.', tags: ['climat'] },
  { fr: 'à l’école', emoji: '🏫', en: 'at school', tags: ['études'] },
  { fr: 'le livre sacré', emoji: '📖', en: 'the holy book, scripture', tags: ['culture'] },
  { fr: 'ennuyeux / ennuyeuse', en: 'boring', tags: ['quotidien'] },
  { fr: 'toute la journée', en: 'all day long', note: 'la journée = the day as a stretch of time; le jour = the calendar day.', tags: ['temps'] },
  { fr: 'une fois', en: 'once, one time', tags: ['temps'] },
  { fr: 'il y a', en: '(time) ago — and: there is / there are', note: 'il y a deux ans = two years ago.', tags: ['temps'] },
  { fr: 'au début', en: 'at the start', tags: ['temps'] },
  { fr: 'petit à petit', en: 'little by little', tags: ['temps'] },
  { fr: 'pour le moment', en: 'for now, at the moment', tags: ['temps'] },
  { fr: 'la chaîne', emoji: '📺', en: 'channel; chain', tags: ['média'] },

  // --- connectors & structure: the highest-leverage cards for sounding B2 ---
  { fr: 'du coup', en: 'so, and so (spoken consequence)', note: 'Everywhere in speech. Written French prefers donc.', tags: ['connecteurs'] },
  {
    fr: 'c’est pourquoi',
    en: 'THAT’S WHY + clause',
    fix: 'Your note said "that’s because", which flips the logic. Cause → effect: il pleuvait, c’est pourquoi je suis resté.',
    tags: ['connecteurs'],
  },
  { fr: 'à cause de', en: 'because of + noun (negative cause)', note: 'For a positive cause, use grâce à.', tags: ['connecteurs'] },
  { fr: 'grâce à', en: 'thanks to', tags: ['connecteurs'] },
  { fr: 'au lieu de', en: 'instead of + infinitive/noun', tags: ['connecteurs'] },
  { fr: 'surtout', en: 'especially, above all', fix: 'Your note said "specially" — the English you want is "especially".', tags: ['connecteurs'] },
  {
    fr: 'franchement',
    en: 'frankly, honestly',
    fix: 'Your note said "actually". Franchement = honestly / to be blunt. For "actually", use en fait.',
    tags: ['connecteurs'],
  },
  { fr: 'en fait', en: 'actually, in fact', tags: ['connecteurs'] },
  { fr: 'au moins', en: 'at least', tags: ['connecteurs'] },
  { fr: 'plusieurs', en: 'several', tags: ['grammaire'] },
  { fr: 'quelques-uns / quelques-unes', en: 'a few (of them)', note: 'Hyphenated. J’en ai lu quelques-uns.', tags: ['grammaire'] },
  { fr: 'tout', en: 'everything, all', tags: ['base'] },
  { fr: 'évident(e)', en: 'obvious', note: 'Also idiomatic: ce n’est pas évident = it’s not that easy.', tags: ['opinion'] },
  { fr: 'concentré(e)', en: 'focused, concentrating', tags: ['travail'] },
  { fr: 'décrire', en: 'to describe', tags: ['base'] },
  { fr: 'changer', en: 'to change, to switch', tags: ['base'] },
  { fr: 'le moyen', en: 'the means, the way (of doing something)', note: 'un moyen de transport; avoir les moyens = to be able to afford it.', tags: ['base'] },
  { fr: 'heurter', en: 'to hit, to collide with', tags: ['transport'] },
  { fr: 'je devais', en: 'I had to / I was supposed to (imparfait of devoir)', tags: ['grammaire'] },
  { fr: 'après avoir + participe passé', en: 'after having (done)', note: 'Après avoir mangé, je suis sorti. Same subject in both halves.', tags: ['grammaire'] },
  {
    fr: 'ça a du sens',
    en: 'that makes sense',
    fix: '"ça fait du sens" is a calque from English. Natives say ça a du sens, or c’est logique.',
    tags: ['connecteurs'],
  },

  // --- the two grammar patterns from your notes, as drillable cards ---
  {
    fr: 'ne pas + verbe + DE',
    en: 'negation swaps un/une/du/des for de',
    note: 'J’ai un stylo → je n’ai pas DE stylo. Je bois du café → je ne bois pas DE café. Exception: with être it stays — ce n’est pas un problème.',
    tags: ['grammaire'],
  },
  {
    fr: 'quelque chose DE + adjectif',
    en: 'something + adjective',
    note: 'quelque chose de bizarre, rien d’intéressant, quelqu’un de sympa. The adjective stays masculine singular.',
    tags: ['grammaire'],
  },
];

export default seedVocab;

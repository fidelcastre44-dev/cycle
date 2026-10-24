// Contenu éditorial — repères généraux, ne remplace pas un avis médical.
const APP_VERSION = "1.0.0";

const CHANGELOG = [
  { version: "1.0.0", date: "2026-10-25", items: [
    "Première version : phase du jour, calendrier, conseils par phase, alerte SPM.",
    "Bouton Retours pour proposer des idées et signaler des bugs.",
  ]},
];

const PHASES = {
  menstruelle: {
    name: "Règles",
    long: "Phase menstruelle",
    color: "var(--menstruelle)",
    what: "Les hormones sont au plus bas, la muqueuse de l'utérus s'élimine.",
    feel: "Fatigue, crampes, bas du dos sensible, besoin de calme.",
    tips: [
      ["Douleurs", "Chaleur sur le ventre (bouillotte), bain chaud, automassage."],
      ["Alimentation", "Aliments riches en fer (lentilles, pois chiches, épinards, viande rouge) avec de la vitamine C. Bien s'hydrater."],
      ["Mouvement", "Doux : marche, yoga, étirements. Ça peut soulager les crampes."],
      ["Sommeil", "S'autoriser plus de repos, se coucher plus tôt."],
      ["À limiter", "Caféine et alcool, qui peuvent accentuer crampes et fatigue."],
      ["Organisation", "Alléger l'agenda si possible."],
    ],
    entourage: "Proposer la bouillotte, prendre quelques tâches en charge, respecter le besoin de calme.",
  },
  folliculaire: {
    name: "Folliculaire",
    long: "Phase folliculaire",
    color: "var(--folliculaire)",
    what: "Les œstrogènes remontent, l'énergie revient.",
    feel: "Regain d'énergie, bonne humeur, envie de nouveauté, concentration facilitée.",
    tips: [
      ["Mouvement", "Bon moment pour les séances plus intenses et les nouveaux défis."],
      ["Organisation", "Lancer des projets, planifier, prendre des décisions."],
      ["Alimentation", "Protéines, légumes, céréales complètes pour soutenir l'énergie."],
      ["Social", "Moment propice aux sorties et aux rencontres."],
    ],
    entourage: "Proposer des activités, des sorties, des projets à deux.",
  },
  ovulatoire: {
    name: "Ovulation",
    long: "Phase ovulatoire",
    color: "var(--ovulatoire)",
    what: "Pic d'œstrogènes puis libération de l'ovule : la période la plus fertile du cycle.",
    feel: "Énergie et confiance au maximum, libido plus forte, parfois une légère douleur d'un côté du bas-ventre.",
    tips: [
      ["Mouvement", "Les performances physiques sont souvent au plus haut."],
      ["Social", "Idéal pour les échanges, présentations, rendez-vous importants."],
      ["Fertilité", "C'est la période la plus fertile. L'appli n'est pas un moyen de contraception."],
      ["Alimentation", "Fibres, fruits et légumes, bonne hydratation."],
    ],
    entourage: "Profiter de cette période d'énergie partagée.",
  },
  luteale: {
    name: "Lutéale",
    long: "Phase lutéale",
    color: "var(--luteale)",
    what: "La progestérone domine. Sans grossesse, les hormones chutent en fin de phase.",
    feel: "Début stable, puis baisse progressive d'énergie, fringales, besoin de cocooning.",
    tips: [
      ["Alimentation", "Repas réguliers, glucides complexes (riz complet, patate douce, avoine) pour stabiliser l'énergie."],
      ["Mouvement", "Garder une activité modérée : marche rapide, vélo, natation, pilates."],
      ["Organisation", "Terminer plutôt que commencer, préparer la semaine suivante."],
    ],
    entourage: "Être attentif à la baisse d'énergie, ne pas surcharger le planning commun.",
  },
};

const SPM = {
  name: "Fenêtre SPM",
  what: "Les derniers jours avant les règles, la chute hormonale peut amplifier émotions et inconforts.",
  feel: "Irritabilité, anxiété, tristesse, sautes d'humeur, seins sensibles, ballonnements, fringales, maux de tête, sommeil perturbé.",
  tips: [
    ["Ballonnements", "Réduire le sel et les plats industriels, boire de l'eau régulièrement."],
    ["Humeur", "Limiter sucres rapides, caféine et alcool, qui amplifient les variations."],
    ["Aliments utiles", "Magnésium et vitamine B6 : banane, oléagineux, légumineuses, chocolat noir, céréales complètes. Du calcium aussi."],
    ["Bouger", "L'exercice régulier, surtout d'endurance, fait partie des mesures les plus efficaces contre le SPM."],
    ["Sommeil", "Horaires réguliers, moins d'écrans le soir."],
    ["Stress", "Respiration lente, cohérence cardiaque 5 minutes, moments pour soi."],
    ["Anticiper", "Éviter de caler échéances lourdes et discussions difficiles sur ces jours quand c'est possible."],
    ["Se rappeler", "Les émotions sont amplifiées mais légitimes, et passagères."],
  ],
  entourage: "Plus de patience et de douceur, ne pas minimiser, proposer sans imposer, petites attentions (repas, plaid, film).",
};

const WHEN_TO_CONSULT = [
  "Douleurs qui empêchent les activités habituelles",
  "Saignements très abondants (protection changée toutes les heures) ou de plus de 7 jours",
  "Cycles de moins de 21 ou plus de 35 jours de façon répétée",
  "Saignements entre les règles",
  "SPM qui perturbe fortement la vie quotidienne ou le moral : des solutions existent",
];

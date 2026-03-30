/**
 * Curated catalog of ~18 core Argentine economic series.
 *
 * These IDs are verified against apis.datos.gob.ar/series and cover
 * the most commonly queried macroeconomic indicators.
 * The catalog helps the LLM suggest series without requiring a search first.
 */

export interface CatalogedSeries {
  id: string;
  title: string;
  shortName: string; // For quick reference in tool output
  frequency: string;
  units: string;
  source: string;
  category: string;
}

export const AR_SERIES_CATALOG: CatalogedSeries[] = [
  // --- Precios ---
  {
    id: "103.1_I2N_2016_M_19",
    title: "IPC Nivel General (base dic-2016)",
    shortName: "IPC",
    frequency: "monthly",
    units: "Índice Dic-2016=100",
    source: "INDEC",
    category: "precios",
  },
  {
    id: "148.1_IPC_NIVEL_NAL_DICI_T_26",
    title: "IPC Nivel General Nacional (trimestral)",
    shortName: "IPC trimestral",
    frequency: "quarterly",
    units: "Índice",
    source: "INDEC",
    category: "precios",
  },

  // --- Actividad Económica ---
  {
    id: "143.3_NO_PR_2004_A_21",
    title: "EMAE — Serie Original (base 2004)",
    shortName: "EMAE",
    frequency: "monthly",
    units: "Índice 2004=100",
    source: "INDEC",
    category: "actividad",
  },
  {
    id: "143.3_NO_PR_2004_A_31",
    title: "EMAE — Desestacionalizada",
    shortName: "EMAE desest.",
    frequency: "monthly",
    units: "Índice 2004=100",
    source: "INDEC",
    category: "actividad",
  },
  {
    id: "143.3_ICE_SERVIA_2004_A_25",
    title: "EMAE — Variación Interanual",
    shortName: "EMAE var. i.a.",
    frequency: "monthly",
    units: "Variación porcentual",
    source: "INDEC",
    category: "actividad",
  },

  // --- Tipo de Cambio ---
  {
    id: "168.1_T_CAMBIOR_D_0_0_26",
    title: "Tipo de Cambio BNA Vendedor",
    shortName: "Dólar oficial",
    frequency: "daily",
    units: "Pesos por dólar",
    source: "BCRA",
    category: "cambiario",
  },

  // --- Sector Monetario ---
  {
    id: "174.1_RRVAS_IDOS_0_0_36",
    title: "Reservas Internacionales del BCRA",
    shortName: "Reservas",
    frequency: "monthly",
    units: "Millones de dólares",
    source: "BCRA",
    category: "monetario",
  },
  {
    id: "331.1_SALDO_BASERIA__15",
    title: "Base Monetaria",
    shortName: "Base monetaria",
    frequency: "monthly",
    units: "Millones de pesos",
    source: "BCRA",
    category: "monetario",
  },
  {
    id: "89.1_IR_BCRARIA_0_M_34",
    title: "Tasa de Política Monetaria",
    shortName: "Tasa PM",
    frequency: "monthly",
    units: "Porcentaje",
    source: "BCRA",
    category: "monetario",
  },

  // --- Empleo ---
  {
    id: "45.1_ECTDT_0_A_33",
    title: "Tasa de Desempleo Total",
    shortName: "Desempleo",
    frequency: "yearly",
    units: "Porcentaje",
    source: "INDEC",
    category: "empleo",
  },
  {
    id: "149.1_TL_INDIIOS_OCTU_0_21",
    title: "Índice de Salarios — Nivel General",
    shortName: "Salarios",
    frequency: "monthly",
    units: "Índice",
    source: "INDEC",
    category: "empleo",
  },
  {
    id: "149.1_TL_REGIADO_OCTU_0_16",
    title: "Índice de Salarios — Registrados",
    shortName: "Salarios registr.",
    frequency: "monthly",
    units: "Índice",
    source: "INDEC",
    category: "empleo",
  },

  // --- Pobreza ---
  {
    id: "60.1_PP_0_0_15",
    title: "Incidencia de Pobreza (personas)",
    shortName: "Pobreza",
    frequency: "semiannual",
    units: "Porcentaje de población",
    source: "INDEC",
    category: "social",
  },
  {
    id: "60.1_IP_0_0_20",
    title: "Incidencia de Indigencia (personas)",
    shortName: "Indigencia",
    frequency: "semiannual",
    units: "Porcentaje de población",
    source: "INDEC",
    category: "social",
  },

  // --- Sector Fiscal ---
  {
    id: "172.3_TL_RECAION_M_0_0_17",
    title: "Recaudación Tributaria Total",
    shortName: "Recaudación",
    frequency: "monthly",
    units: "Millones de pesos",
    source: "Min. Economía",
    category: "fiscal",
  },

  // --- Comercio Exterior ---
  {
    id: "335.1_CUENTA_CONES__42",
    title: "Exportaciones de Mercancías",
    shortName: "Exportaciones",
    frequency: "yearly",
    units: "Millones de dólares",
    source: "BCRA",
    category: "comercio",
  },
  {
    id: "335.1_CUENTA_CONES_IV__42",
    title: "Importaciones de Mercancías",
    shortName: "Importaciones",
    frequency: "yearly",
    units: "Millones de dólares",
    source: "BCRA",
    category: "comercio",
  },

  // --- Línea de pobreza ---
  {
    id: "150.1_LA_INDICIA_0_D_16",
    title: "Línea de Indigencia (canasta básica alimentaria)",
    shortName: "Línea indigencia",
    frequency: "monthly",
    units: "Pesos corrientes",
    source: "INDEC",
    category: "social",
  },
];

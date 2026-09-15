/**
 * Régua SAGE congelada — controle positivo dos testes de ALGORITMO de branding.
 *
 * É o `REGUA_DO_PRODUTO` do upstream (DeskcommCRM v1.27.0) no momento em que o fork
 * Bacco trocou a paleta. Os testes de algoritmo (contraste, reconciliação, caminhada,
 * pares pintados, calibração da rampa) têm números medidos contra a Sage; ler o
 * globals.css do produto faria colar números novos em controle positivo, o que
 * desarma o teste. Asserções sobre a paleta DO PRODUTO leem o globals.css, nunca
 * este arquivo. NÃO regenere.
 */
import type { Regua } from "@/lib/branding/contraste";

export const REGUA_SAGE: Regua = {
  "rampaDoProduto": [
    "#f3f6f1",
    "#e4ebe0",
    "#c8d6c1",
    "#a4ba9a",
    "#82a077",
    "#67885d",
    "#506d48",
    "#41573b",
    "#374731",
    "#2f3c2b",
    "#171f15"
  ],
  "claro": {
    "nome": "claro",
    "base": [
      {
        "chave": "--color-bg",
        "hex": "#faf9f6"
      },
      {
        "chave": "--color-surface",
        "hex": "#ffffff"
      },
      {
        "chave": "--color-surface-elevated",
        "hex": "#f5f3ee"
      }
    ],
    "tingidas": [
      {
        "chave": "--color-accent-soft",
        "fonte": {
          "tipo": "grau",
          "indice": 1,
          "alfa": 1
        }
      }
    ],
    "papeis": [
      {
        "token": "--color-accent",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 6,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--color-accent-fg",
        "tipo": "texto",
        "fonte": {
          "tipo": "frenteCalculada",
          "sobre": {
            "tipo": "grau",
            "indice": 6,
            "alfa": 1
          }
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 6,
            "alfa": 1
          }
        ]
      },
      {
        "token": "--color-accent-hover",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 7,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--ring",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 5,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "::selection/color",
        "tipo": "texto",
        "fonte": {
          "tipo": "grau",
          "indice": 10,
          "alfa": 1
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 2,
            "alfa": 1
          }
        ]
      },
      {
        "token": ":focus-visible/outline",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 5,
          "alfa": 1
        },
        "contra": null
      }
    ],
    "semanticas": [
      {
        "nome": "success",
        "hex": "#5a8a5f"
      },
      {
        "nome": "warning",
        "hex": "#b07a2b"
      },
      {
        "nome": "error",
        "hex": "#a94a3c"
      },
      {
        "nome": "info",
        "hex": "#4a7a93"
      }
    ],
    "neutros": [
      "#faf9f6",
      "#f3f1ec",
      "#e7e3da",
      "#d2cdbf",
      "#a9a395",
      "#7d786c",
      "#5d594f",
      "#46433b",
      "#2e2c26",
      "#1c1a16",
      "#0e0d0a"
    ],
    "indices": {
      "accent": 6,
      "hover": 7,
      "soft": 1
    },
    "alfaDoSoft": 1
  },
  "escuro": {
    "nome": "escuro",
    "base": [
      {
        "chave": "--color-bg",
        "hex": "#161510"
      },
      {
        "chave": "--color-surface",
        "hex": "#1d1c17"
      },
      {
        "chave": "--color-surface-elevated",
        "hex": "#272620"
      }
    ],
    "tingidas": [
      {
        "chave": "--color-accent-soft",
        "fonte": {
          "tipo": "literal",
          "hex": "#82a077",
          "alfa": 0.16
        }
      }
    ],
    "papeis": [
      {
        "token": "--color-accent",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 4,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--color-accent-fg",
        "tipo": "texto",
        "fonte": {
          "tipo": "frenteCalculada",
          "sobre": {
            "tipo": "grau",
            "indice": 4,
            "alfa": 1
          }
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 4,
            "alfa": 1
          }
        ]
      },
      {
        "token": "--color-accent-hover",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 3,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "--ring",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 4,
          "alfa": 1
        },
        "contra": null
      },
      {
        "token": "[data-theme=\"dark\"] ::selection/color",
        "tipo": "texto",
        "fonte": {
          "tipo": "grau",
          "indice": 0,
          "alfa": 1
        },
        "contra": [
          {
            "tipo": "grau",
            "indice": 7,
            "alfa": 1
          }
        ]
      },
      {
        "token": "[data-theme=\"dark\"] :focus-visible/outline-color",
        "tipo": "componente",
        "fonte": {
          "tipo": "grau",
          "indice": 4,
          "alfa": 1
        },
        "contra": null
      }
    ],
    "semanticas": [
      {
        "nome": "success",
        "hex": "#82a077"
      },
      {
        "nome": "warning",
        "hex": "#d09455"
      },
      {
        "nome": "error",
        "hex": "#c87263"
      },
      {
        "nome": "info",
        "hex": "#7da9bf"
      }
    ],
    "neutros": [
      "#f5f4ef",
      "#e6e4dc",
      "#bbb8ac",
      "#8e8b7f",
      "#605e54",
      "#444239",
      "#33312a",
      "#272620",
      "#1d1c17",
      "#161510",
      "#0c0b08"
    ],
    "indices": {
      "accent": 4,
      "hover": 3,
      "soft": null
    },
    "alfaDoSoft": 0.16
  }
};

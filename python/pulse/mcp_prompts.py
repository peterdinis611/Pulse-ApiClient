"""MCP prompt templates so the agent does not have to memorize Pulse tool names."""

from __future__ import annotations

from typing import Any

PROMPTS: list[dict[str, Any]] = [
    {
        "name": "run_and_explain",
        "description": "Spusti Pulse kolekciu a vysvetli zlyhania (HTTP aj testy).",
        "arguments": [
            {
                "name": "path",
                "description": "Cesta ku kolekcii, napr. python/examples/pets.json",
                "required": True,
            },
            {
                "name": "env",
                "description": "Voliteľný JSON objekt premenných ({{baseUrl}} a pod.)",
                "required": False,
            },
        ],
    },
    {
        "name": "openapi_to_pulse",
        "description": "Z OpenAPI sprav Pulse kolekciu a otestuj 2xx odpovede.",
        "arguments": [
            {
                "name": "path",
                "description": "Cesta k OpenAPI JSON/YAML, napr. python/examples/openapi.json",
                "required": True,
            },
            {
                "name": "name",
                "description": "Voliteľný názov výstupného súboru (stem) v python/examples/.out/",
                "required": False,
            },
        ],
    },
    {
        "name": "compare_responses",
        "description": "Porovnaj dva HTTP JSON response (URL alebo hotový JSON).",
        "arguments": [
            {
                "name": "a",
                "description": "Prvá URL alebo JSON telo",
                "required": True,
            },
            {
                "name": "b",
                "description": "Druhá URL alebo JSON telo",
                "required": True,
            },
            {
                "name": "method",
                "description": "HTTP metóda ak a/b sú URL (default GET)",
                "required": False,
            },
        ],
    },
]


def list_prompts() -> list[dict[str, Any]]:
    return [
        {
            "name": item["name"],
            "description": item["description"],
            "arguments": item["arguments"],
        }
        for item in PROMPTS
    ]


def get_prompt(name: str, arguments: dict | None) -> dict[str, Any] | None:
    args = arguments or {}
    if name == "run_and_explain":
        path = args.get("path") or "python/examples/pets.json"
        env = args.get("env")
        env_line = (
            f"Do arguments daj aj env ako JSON objekt: {env}."
            if env
            else "Env pridaj len ak ho používateľ zadal; inak tool zavolaj bez env."
        )
        text = (
            f"Spusti Pulse kolekciu `{path}`.\n"
            "Použi tool pulse_run_collection s path na ten súbor a summary=true.\n"
            f"{env_line}\n"
            "Keď dobehne, nevypisuj celý JSON. Zhrň počty passed/failed/httpErrors.\n"
            "Každé zlyhanie vysvetli: názov requestu, či padol HTTP (error) alebo test, a čo opraviť.\n"
            "Detaily vieš dočítať z resource pulse://last-run."
        )
        return _user(text, description="Spusti kolekciu a vysvetli zlyhania")
    if name == "openapi_to_pulse":
        path = args.get("path") or "python/examples/openapi.json"
        name_arg = args.get("name")
        name_line = (
            f'Ako name použi "{name_arg}".'
            if name_arg
            else "name môžeš vynechať — tool ho zoberie zo stem súboru."
        )
        text = (
            f"Z OpenAPI `{path}` urob Pulse kolekciu a otestuj 2xx.\n"
            "1. Zavolaj pulse_openapi s path na spec. Nechaj inline=false, nech sa zapíše súbor.\n"
            f"   {name_line}\n"
            "2. Z výsledku zober path a na ňom zavolaj pulse_run_collection (summary=true).\n"
            "   OpenAPI konverzia už pridáva test na prvý 2xx status — neskrývaj to do vlastného skriptu.\n"
            "3. Zhrň čo prešlo a čo padlo. Celú kolekciu do chatu nedávaj."
        )
        return _user(text, description="Z OpenAPI urob Pulse a otestuj 2xx")
    if name == "compare_responses":
        left = args.get("a") or ""
        right = args.get("b") or ""
        method = str(args.get("method") or "GET").upper()
        text = (
            "Porovnaj dva JSON response. Nevypisuj celé telá — len diff.\n"
            f"A: {left}\n"
            f"B: {right}\n"
            f"Ak A alebo B vyzerá ako URL, zavolaj pulse_send (method {method}) a porovnaj status + JSON body.\n"
            "Ak to už je JSON, porovnaj priamo.\n"
            "Vypíš: status kód, kľúče len v jednom, zmenené hodnoty. Zhody nespomínaj, kým nie sú dôležité."
        )
        return _user(text, description="Porovnaj dva response JSON")
    return None


def _user(text: str, *, description: str) -> dict[str, Any]:
    return {
        "description": description,
        "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
    }

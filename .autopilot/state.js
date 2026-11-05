window.STATE =
{
  "version": 2,
  "slug": "team-system",
  "dir": "2026-11-05-team-system--wip",
  "title": "Система-команда для TripTrek",
  "mode": "interview",
  "depth": "deep",
  "tier": "T2",
  "briefFile": "2026-11-05-brief.md",
  "memoryFile": "AGENTS.md",
  "memoryOwner": "user",
  "skillDir": "C:/Users/world/.agents/skills/autopilot",
  "baseCommit": null,
  "startedAt": "2026-11-05T18:59:21+03:00",
  "updatedAt": "2026-11-05T19:41:32+03:00",
  "finishedAt": null,
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-11-05T18:59:21+03:00",
      "finishedAt": "2026-11-05T19:01:09+03:00"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-11-05T19:01:09+03:00",
      "finishedAt": "2026-11-05T19:02:14+03:00"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-11-05T19:02:14+03:00",
      "finishedAt": "2026-11-05T19:24:47+03:00"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-11-05T19:24:47+03:00",
      "finishedAt": "2026-11-05T19:38:58+03:00"
    },
    {
      "id": "plan",
      "status": "active",
      "startedAt": "2026-11-05T19:38:58+03:00"
    },
    {
      "id": "build",
      "status": "pending"
    },
    {
      "id": "review",
      "status": "pending"
    },
    {
      "id": "final",
      "status": "pending"
    }
  ],
  "requirements": {
    "total": 16,
    "done": 0,
    "inTicket": 16,
    "inSpec": 0,
    "placeholder": 0,
    "deferred": 0,
    "dropped": 0
  },
  "tickets": [
    {
      "id": "01",
      "title": "Ядро системы: архив v1, политики, цикл, роли, шаблоны",
      "requirements": [
        "R01",
        "R02",
        "R03",
        "R04",
        "R05",
        "R06",
        "R07",
        "R08",
        "R09",
        "R10",
        "R11",
        "R13",
        "R16i"
      ],
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "team/",
        "team/jobs/",
        "team/inbox/",
        "team/sync.mjs",
        "docs/archive/",
        "docs/adr/",
        ".claude/",
        ".github/"
      ],
      "review": "да — фундамент",
      "model": "сильная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "02",
      "title": "Синк ролей в платформенные форматы",
      "requirements": [
        "R14i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "team/sync.mjs",
        ".claude/agents/",
        ".github/agents/",
        ".agents/"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    },
    {
      "id": "03",
      "title": "Джобы: дайджест отзывов, аудит, контент-план",
      "requirements": [
        "R08",
        "R09",
        "R12",
        "R15i"
      ],
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "team/jobs/",
        "team/inbox/",
        ".gitignore"
      ],
      "review": "нет",
      "model": "обычная",
      "status": "pending",
      "retries": 0,
      "repairs": 0
    }
  ],
  "tests": null,
  "debt": {
    "placeholders": [],
    "assumptions": [],
    "emptyEnv": []
  },
  "additions": [],
  "coverage": {
    "found": 4,
    "fixed": 3,
    "deferred": 1,
    "items": [
      "R10 — «и остальне»: владелец не раскрыл, что имелось в виду; записано в манифесте, система расширяема, уйдёт в отчёт"
    ]
  },
  "concerns": [],
  "blind": null,
  "beats": [
    "2026-11-05T18:59:21+03:00",
    "2026-11-05T19:01:09+03:00",
    "2026-11-05T19:02:13+03:00",
    "2026-11-05T19:02:14+03:00",
    "2026-11-05T19:03:45+03:00",
    "2026-11-05T19:12:21+03:00",
    "2026-11-05T19:24:47+03:00",
    "2026-11-05T19:38:57+03:00",
    "2026-11-05T19:38:58+03:00",
    "2026-11-05T19:40:14+03:00",
    "2026-11-05T19:41:32+03:00"
  ],
  "rev": 13,
  "waiting": null,
  "waits": [
    {
      "kind": "briefing",
      "from": "2026-11-05T19:03:45+03:00",
      "to": "2026-11-05T19:24:47+03:00"
    }
  ],
  "log": [
    {
      "t": "2026-11-05T18:59:21+03:00",
      "k": "init"
    },
    {
      "t": "2026-11-05T19:01:09+03:00",
      "k": "stage",
      "id": "manifest",
      "act": "start"
    },
    {
      "t": "2026-11-05T19:02:14+03:00",
      "k": "stage",
      "id": "briefing",
      "act": "start"
    },
    {
      "t": "2026-11-05T19:03:45+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "раунд 1: форма системы, отзывы vs read-only прод, доступ к проду, границы маркетинга"
    },
    {
      "t": "2026-11-05T19:12:21+03:00",
      "k": "ask",
      "kind": "briefing",
      "note": "раунд 2: судьба существующей AI team, платформы ролей, расписание джобов, точка входа задач"
    },
    {
      "t": "2026-11-05T19:24:47+03:00",
      "k": "answered",
      "kind": "briefing"
    },
    {
      "t": "2026-11-05T19:24:47+03:00",
      "k": "gate",
      "g": "G1",
      "ok": false,
      "open": 16,
      "total": 16
    },
    {
      "t": "2026-11-05T19:24:47+03:00",
      "k": "stage",
      "id": "spec",
      "act": "start"
    },
    {
      "t": "2026-11-05T19:38:57+03:00",
      "k": "gate",
      "g": "G2",
      "ok": true,
      "found": 4,
      "fixed": 3,
      "deferred": 1
    },
    {
      "t": "2026-11-05T19:38:58+03:00",
      "k": "stage",
      "id": "plan",
      "act": "start"
    },
    {
      "t": "2026-11-05T19:40:14+03:00",
      "k": "tier",
      "v": "T2"
    },
    {
      "t": "2026-11-05T19:41:32+03:00",
      "k": "tickets",
      "n": 3
    },
    {
      "t": "2026-11-05T19:41:32+03:00",
      "k": "gate",
      "g": "G3",
      "ok": true,
      "problems": 0
    }
  ],
  "reqList": [
    {
      "id": "R01",
      "text": "«систему, архитектуру для работы с проектом трип трек»",
      "status": "in-ticket"
    },
    {
      "id": "R02",
      "text": "«попутно уточняя у меня важно[е]» · «надо что то конкретное спрашивай»",
      "status": "in-ticket"
    },
    {
      "id": "R03",
      "text": "«полный пайплан, от идеи… обговорим, выявим сильные слабые стороны»",
      "status": "in-ticket"
    },
    {
      "id": "R04",
      "text": "«план, спека и так далее»",
      "status": "in-ticket"
    },
    {
      "id": "R05",
      "text": "«до самой релаизации»",
      "status": "in-ticket"
    },
    {
      "id": "R06",
      "text": "«маркетинг, придумывания стратегии продвижения»",
      "status": "in-ticket"
    },
    {
      "id": "R07",
      "text": "«проверки кода»",
      "status": "in-ticket"
    },
    {
      "id": "R08",
      "text": "«проверка и ответы на обратный отзывыв пользователей в приложении»",
      "status": "in-ticket"
    },
    {
      "id": "R09",
      "text": "«проверку слабых мест»",
      "status": "in-ticket"
    },
    {
      "id": "R10",
      "text": "«аналитика текстов и остальне[е]»",
      "status": "in-ticket"
    },
    {
      "id": "R11",
      "text": "«превратить меня и мой проект в некую такую команду по разработки и поддержки на всех этапах»",
      "status": "in-ticket"
    },
    {
      "id": "R12",
      "text": "«данные можешь собирать с прода, но только читать»",
      "status": "in-ticket"
    },
    {
      "id": "R13",
      "text": "«по итогу я мог также писать задачу, её подхватыл агент отдельный со своей ролью и делал»",
      "status": "in-ticket"
    },
    {
      "id": "R14i",
      "text": "(подразумевается) где эта система живёт",
      "status": "in-ticket"
    },
    {
      "id": "R15i",
      "text": "(подразумевается) кто и как запускает агентов",
      "status": "in-ticket"
    },
    {
      "id": "R16i",
      "text": "(подразумевается) судьба существующей «AI team» v1",
      "status": "in-ticket"
    }
  ],
  "gates": {
    "G1": {
      "ok": false,
      "at": "2026-11-05T19:24:47+03:00",
      "open": 16,
      "total": 16
    },
    "G2": {
      "ok": true,
      "at": "2026-11-05T19:38:57+03:00",
      "found": 4,
      "fixed": 3,
      "deferred": 1
    },
    "G3": {
      "ok": true,
      "at": "2026-11-05T19:41:32+03:00",
      "problems": 0
    }
  },
  "result": null
}

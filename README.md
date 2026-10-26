# Reversi

Reversi für zwei Spieler im Browser. Portfolioaufgabe WWI25EG Web-Entwicklung, DHBW Mannheim.

## Starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run build
npm start -- 3000
```

Danach `http://localhost:3000` in zwei Browserfenstern öffnen.

- `npm run build` prüft nur, ob alle JavaScript-Dateien syntaktisch korrekt sind. Gebündelt wird nichts, der Browser lädt die Module direkt.
- Der Port kann auch über `PORT` gesetzt werden, die Bedenkzeit pro Zug über `TURN_SECONDS` (Standard: 60).
- Der Server lauscht auf allen Adressen, also über IPv4 und IPv6. So ist es für den Kursserver gedacht. Beim Entwickeln in einem fremden WLAN (Uni, Bahn) ist das Spiel damit aber für alle im Netz erreichbar. Dann besser `HOST=127.0.0.1` setzen.
- Alle Einstellungen mit Beispielwerten stehen in `.env.example`. Als `.env` kopiert, lädt `node --env-file=.env server/index.js` sie.

## Spielablauf in Bildern

Zwei Browserfenster bei 1024×768: Christa spielt gegen Bruno. Jeder kann sein eigenes Brett wählen, Bruno spielt hier auf Holz.

**Anmelden, Brett wählen, auf einen Gegner warten**

![Anmeldung](docs/screenshots/01-anmeldung.png)
![Brettwahl](docs/screenshots/02-brettwahl.png)
![Warten auf einen Gegner](docs/screenshots/03-warten.png)

**Die Partie beginnt.** Wer zuerst gewartet hat, spielt Schwarz und beginnt. Die Ringe zeigen die erlaubten Züge, aber nur dem Spieler, der am Zug ist.

![Spielstart](docs/screenshots/04-spielstart.png)

**Während der Partie** stehen Punktestand, Bedenkzeit und Zugverlauf rechts neben dem Brett. Der letzte Zug ist umrandet.

![Laufende Partie](docs/screenshots/05-partie.png)

**Einstellungen** gelten nur für das eigene Fenster und gehen nicht an den Server.

![Einstellungen](docs/screenshots/06-einstellungen.png)

**Zug abgelehnt.** Mit ausgeschalteter Zugvorschau kann man jedes freie Feld anklicken. Der Server prüft den Zug und nennt den Grund, wenn er nicht erlaubt ist.

![Abgelehnter Zug](docs/screenshots/07-zug-abgelehnt.png)

**Aussetzen.** Hat ein Spieler keinen erlaubten Zug, setzt er aus und der andere ist noch einmal dran.

![Aussetzen](docs/screenshots/08-aussetzen.png)

**Spielende.** Beide sehen das Ergebnis und den Grund. „Erneut anmelden“ führt zurück zur Brettwahl.

![Ergebnis](docs/screenshots/09-ergebnis.png)

**Aufgeben** braucht zwei Klicks, damit ein Fehlklick nicht die Partie kostet.

![Aufgeben bestätigen](docs/screenshots/10-aufgeben-bestaetigen.png)
![Aufgegeben](docs/screenshots/11-aufgegeben.png)

**Gegner verlässt die Partie**, zum Beispiel durch Schließen des Fensters.

![Gegner hat die Partie verlassen](docs/screenshots/12-gegner-weg.png)

**Bedenkzeit.** Für diese Bilder wurde die Bedenkzeit auf 8 Sekunden gesetzt (`TURN_SECONDS=8`), normal sind es 60. In den letzten Sekunden wird die eigene Uhr rot. Läuft sie ab, setzt der Server einen zufälligen erlaubten Stein. Beim dritten Mal hintereinander gilt die Partie als aufgegeben.

![Bedenkzeit läuft ab](docs/screenshots/13-bedenkzeit.png)
![Zeit abgelaufen](docs/screenshots/14-zeit-abgelaufen.png)
![Aufgabe nach drei Zeitüberschreitungen](docs/screenshots/15-aufgabe-zeit.png)

**Farbsehschwäche.** Eigene Steinfarben, Symbole auf den Steinen (Punkt und Kreuz) und Koordinaten am Rand.

![Symbole und eigene Farben](docs/screenshots/16-farbenblind.png)

**Smartphone hochkant**

![Smartphone](docs/screenshots/17-smartphone.png)

## Prüfen

```bash
npm test               # Tests (node:test)
npm run test:coverage  # Tests mit Abdeckungsbericht
npm run lint           # ESLint
npm run lint:css       # Stylelint
npm run lint:html      # html-validate
npm run format:check   # Prettier
npm run check          # alles zusammen
```

`lint:css` und `lint:html` laden Stylelint und html-validate in einer festen Version über `npx`, statt sie zu installieren. Die Regeln stehen in `.stylelintrc.json` und `.htmlvalidate.json`.

Was die Tests abdecken:

- Server: Spielregeln, Bedenkzeit, Lobby, die Prüfung der Namen und der Einstellungen. Drei Testdateien starten den echten Server und spielen mit Socket.io-Clients über das Netz, darunter die Grenzen gegen Überlastung und fremde Seiten. Der Server läuft dabei im Testprozess, damit er im Abdeckungsbericht erscheint. Den Start über `server/index.js` prüft ein eigener Test.
- Client: die Module ohne DOM direkt, die Module mit DOM (Brett, Einstellungen, Uhr, Hinweise, Punktestand, Zugverlauf, Ergebnisfenster) unter jsdom.
- Nicht automatisch getestet ist `main.js`, das die Module verbindet. Sein Ablauf wurde mit zwei Browserfenstern geprüft.

## Aufbau

```
server/
  game.js     Spielregeln
  match.js    eine Partie mit Bedenkzeit
  lobby.js    Spieler zusammenbringen, Partien verwalten
  app.js      Express und Socket.io, ein Handler pro Nachricht
  limits.js   Herkunftsprüfung, Grenzen für Verbindungen und Nachrichten
  config.js   Einstellungen aus Kommandozeile und Umgebung
  index.js    startet den Server
public/
  index.html
  css/        tokens, base, layout, board, components, dialogs
  js/         main.js verbindet, die übrigen Module zeichnen Brett, Uhr,
              Punktestand, Zugverlauf, Hinweise und Ergebnis oder
              verwalten die Einstellungen
  shared/     Konstanten und Namensregel für Server und Client
test/
scripts/check.js
```

```mermaid
flowchart LR
  subgraph Browser
    M[main.js] --> B[board.js]
    M --> C[clock.js]
    M --> H[hints.js]
    M --> S[settings.js]
    M --> F[flow.js]
    M --> Sc[score.js]
    M --> R[result.js]
    M --> N[net.js]
  end
  subgraph Server
    I[index.js] --> A[app.js]
    A --> L[lobby.js]
    L --> Ma[match.js]
    Ma --> G[game.js]
  end
  N <-->|Socket.io| A
```

`game.js` kennt weder Zeit noch Netzwerk, `match.js` keine Sockets. Dadurch lassen sich die Regeln ohne Server testen. `app.js` startet nichts selbst und beendet nie den Prozess; das tut nur `index.js`.

`public/shared/` liegt unter `public/`, damit der Browser die Dateien unter `/shared/` laden kann und der Server sie direkt importiert. Derselbe Pfad `../shared/…` funktioniert so im Browser und in den Tests unter Node.

## Ablauf

Der Server entscheidet alles. Der Client schickt nur, was der Spieler tun möchte (zum Beispiel „Stein auf Feld D3“), aber nie ein Brett oder einen Punktestand. Der Server prüft, ob der Spieler am Zug ist und ob der Zug erlaubt ist, und schickt dann beiden den neuen Stand. Ein manipulierter Client kann so nichts erzwingen.

```mermaid
sequenceDiagram
  participant A as Spieler 1 (Schwarz)
  participant S as Server
  participant B as Spieler 2 (Weiß)

  A->>S: join
  S-->>A: waiting
  B->>S: join
  S-->>A: gameStart
  S-->>B: gameStart

  A->>S: move {row, col}
  Note over S: am Zug? erlaubt?
  S-->>A: state
  S-->>B: state

  B->>S: move (nicht am Zug)
  S-->>B: rejected

  Note over S: keiner kann mehr ziehen
  S-->>A: gameOver
  S-->>B: gameOver
```

| Client → Server       | Bedeutung                   |
| --------------------- | --------------------------- |
| `join {name, ticket}` | anmelden und Gegner suchen  |
| `move {row, col}`     | Stein setzen                |
| `resign`              | aufgeben                    |
| `leave`               | Suche oder Partie verlassen |

| Server → Client | Bedeutung                                                                          |
| --------------- | ---------------------------------------------------------------------------------- |
| `waiting`       | wartet auf einen Gegner                                                            |
| `gameStart`     | Partie beginnt, mit Farbe, Namen und Startzustand                                  |
| `state`         | neuer Stand nach jedem Zug, mit den Ereignissen (Zug, Aussetzen, Zeitablauf, Ende) |
| `rejected`      | Zug abgelehnt, nur an den Absender                                                 |
| `joinRejected`  | Anmeldung abgelehnt, weil man schon spielt                                         |
| `gameOver`      | Ergebnis oder Abbruch                                                              |
| `errorMessage`  | unerwarteter Fehler                                                                |

`ticket` ist eine Nummer, die jede Suche im Client bekommt. Der Server schickt sie unverändert zurück. Bricht jemand die Suche ab und sucht sofort neu, erkennt der Client so eine verspätete Antwort auf die alte Suche und ignoriert sie (`public/js/flow.js`).

## Bedenkzeit

Jeder Zug hat 60 Sekunden, die Uhr läuft auf dem Server. Läuft die Zeit ab, setzt der Server einen zufälligen erlaubten Stein für den Spieler. Einfach aussetzen lassen ginge nicht, weil Aussetzen bei Reversi nur erlaubt ist, wenn man keinen Zug hat. Wer dreimal hintereinander nicht selbst zieht, hat aufgegeben.

## Bedienung ohne Maus

- Das Brett ist ein Raster mit einem einzigen Tab-Stopp. Darin bewegen die Pfeiltasten den Fokus, Pos1 und Ende springen an den Rand der Zeile, Strg+Pos1 und Strg+Ende in die Ecken. Enter oder Leertaste setzt den Stein. Zu Beginn der Partie liegt der Fokus schon auf dem Brett.
- Was gleichzeitig passiert (ein Zug, Aussetzen, wer jetzt dran ist), sagt der Screenreader in einer Ansage, statt dass sich mehrere Meldungen unterbrechen. Bei „Erlaubte Züge: Aus“ werden mögliche Züge auch nicht vorgelesen.
- Im Windows-Kontrastdesign (`forced-colors`) erscheinen die Steine als volle und leere Kreise, das Gitter als Linien.

## Fehlerfälle

- Schließt ein Spieler das Fenster, endet die Partie und der Gegner bekommt eine Meldung. Der Server läuft weiter.
- Ungültige Nachrichten (falsche Koordinaten, Zug außerhalb der Reihe) lehnt der Server ab.
- Fehler in einem Socket-Handler werden abgefangen und geloggt, damit der Server nicht abstürzt und andere Partien weiterlaufen.
- Mehrere Partien laufen unabhängig voneinander.
- Socket-Verbindungen von fremden Webseiten lehnt der Server ab. Er nimmt höchstens 50 Verbindungen je IP-Adresse an (`MAX_CONNECTIONS_PER_IP`), Nachrichten bis 4 KB und 20 Nachrichten pro Sekunde und Verbindung. Darüber verwirft er sie, damit eine Flut nicht die anderen Partien bremst.
- Nach einem abgelehnten Zug schickt der Server das ganze Brett höchstens einmal pro Sekunde mit, nicht nach jeder Ablehnung.

## Regeln und Herkunft

Reversi ist nicht in diesem Projekt erfunden worden. Das Spiel stammt aus England; Lewis Waterman und John W. Mollett beanspruchten beide, es 1883 erfunden zu haben ([Wikipedia](https://en.wikipedia.org/wiki/Reversi)).

Umgesetzt sind die heute üblichen Regeln, wie sie auch die [World Othello Federation](https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english) beschreibt:

- Start mit vier Steinen in der Mitte, Schwarz beginnt.
- Ein Zug muss mindestens einen gegnerischen Stein einschließen und umdrehen.
- Wer keinen erlaubten Zug hat, setzt aus.
- Die Partie endet, wenn keiner mehr ziehen kann. Wer mehr Steine hat, gewinnt.

Die Bedenkzeit, das Aufgeben und die Spielhilfen (Zugvorschau, Eckenmarkierung) sind eigene Ergänzungen. „Othello“ ist eine eingetragene Marke, deshalb heißt das Projekt Reversi.

## Fremde Bestandteile

- `express` und `socket.io` (MIT-Lizenz). Für Tests und Codeprüfung zusätzlich `socket.io-client`, `jsdom`, `eslint` und `prettier`, ebenfalls MIT. Stylelint und html-validate (MIT) werden nur über `npx` geladen.
- Die bunten Steinfarben stammen aus der Palette von Okabe und Ito, die auch bei Farbsehschwäche unterscheidbar bleibt ([Color Universal Design](https://jfly.uni-koeln.de/color/)).
- Icons und Brett sind selbst gezeichnet. Es gibt keine fremden Bilder, Schriften oder Töne.

## Noch offen

- In Firefox und Safari ist das Spiel noch nicht getestet.
- Auf sehr schmalen Smartphones (360 px) sind die Brettfelder gut 40 px groß statt 44 px. Für 44 px fehlen dort etwa 30 px, die nur ohne Seitenrand und Rahmen frei würden. 40 px liegen über den 24 px, die WCAG 2.2 (2.5.8) mindestens verlangt.

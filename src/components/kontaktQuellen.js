// ── Woher die Kontakte kommen ────────────────────────────────────────────────
//
// Zwei Töpfe: die Kontakte **dieses Projekts** und die projektübergreifende
// **Kontaktdatenbank**. In einer Notiz ist mal der eine, mal der andere der
// richtige — ein Anruf geht auch an jemanden, der in diesem Projekt (noch)
// nicht geführt wird.
//
// Vorgabe ist das Projekt: das ist in neun von zehn Fällen gemeint, und die
// kurze Liste ist schneller zu überblicken. Wer dort nichts findet, bekommt im
// Vorschlagsfeld die Treffer der anderen Quelle angeboten (siehe
// `ContactAutocomplete`) — niemand soll raten müssen, in welcher Schublade
// jemand steckt.
//
// Ist eine Quelle leer, fällt sie weg: eine Umschaltung mit nur einer Seite
// wäre nur ein Knopf, der nichts tut.
export function kontaktQuellen(projektKontakte, alleKontakte, {
  projektLabel = 'Projekt',
  alleLabel    = 'Kontaktdatenbank',
} = {}) {
  const quellen = []
  if (projektKontakte?.length) {
    quellen.push({ id: 'projekt', label: projektLabel, contacts: projektKontakte })
  }
  if (alleKontakte?.length) {
    quellen.push({ id: 'alle', label: alleLabel, contacts: alleKontakte })
  }
  return quellen
}

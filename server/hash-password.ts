// Génère le hash bcrypt de ADMIN_PASSWORD_HASH : npm run hash-password
// Le mot de passe est saisi sans écho dans le terminal : il ne passe ni par les arguments
// de la commande (donc pas dans l'historique du shell), ni par un fichier.
import bcrypt from 'bcryptjs'

const COUT_BCRYPT = 12
const LONGUEUR_MIN = 12
// bcrypt ignore tout ce qui dépasse 72 octets
const OCTETS_MAX = 72

function saisirMasque(invite: string): Promise<string> {
  const { stdin, stdout } = process
  if (!stdin.isTTY) {
    console.error('Lancer ce script dans un terminal interactif.')
    process.exit(1)
  }
  return new Promise((resolve) => {
    let saisie = ''
    stdout.write(invite)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const terminer = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', surTouche)
      stdout.write('\n')
    }

    const surTouche = (morceau: string) => {
      for (const car of morceau) {
        if (car === '\r' || car === '\n') {
          terminer()
          return resolve(saisie)
        }
        if (car === '\u0003') {
          // Ctrl+C
          terminer()
          process.exit(130)
        }
        if (car === '\u007f' || car === '\b') {
          saisie = [...saisie].slice(0, -1).join('')
        } else if (car >= ' ') {
          saisie += car
        }
      }
    }
    stdin.on('data', surTouche)
  })
}

const motDePasse = await saisirMasque('Mot de passe admin : ')
if ([...motDePasse].length < LONGUEUR_MIN) {
  console.error(`Trop court : ${LONGUEUR_MIN} caractères minimum.`)
  process.exit(1)
}
if (Buffer.byteLength(motDePasse) > OCTETS_MAX) {
  console.error(`Trop long : bcrypt ne prend en compte que ${OCTETS_MAX} octets.`)
  process.exit(1)
}
if ((await saisirMasque('Confirmer : ')) !== motDePasse) {
  console.error('Les deux saisies ne correspondent pas.')
  process.exit(1)
}

const hash = await bcrypt.hash(motDePasse, COUT_BCRYPT)
console.log("\nÀ copier dans server/.env (les apostrophes évitent toute interprétation des '$') :\n")
console.log(`ADMIN_PASSWORD_HASH='${hash}'`)

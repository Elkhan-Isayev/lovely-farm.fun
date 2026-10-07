# Lyubimaya Ferma: what is known about the original

Fan research for the remake. The original's servers were shut down on 7 October 2016 and the official group ran until 10 October, so everything here comes from archived guides, reviews and screenshots. Russian terms are transliterated or translated.

## Facts

| | |
|---|---|
| Platform | Mail.ru's "My World" (Moy Mir) social network; later versions on Odnoklassniki and VKontakte |
| Publisher | Mail.Ru Group; development is attributed to IT Territory |
| Launch | 2010 (OK.ru lists 28 July 2010) |
| Audience | over 5 million players in the first year, about 800,000 daily |
| Awards | "Best Social Game", KRI 2010 |
| Shutdown | 7 October 2016 |

## Mechanics confirmed by sources

- **Beds**: dig with a shovel (10 coins — the guide's efficiency formula subtracts 10) → plant seeds → water → fertilize (only after watering) → harvest.
- **Withering**: a ripe crop withers after as long as it took to grow ("wither time = ripening time").
- **Cellar**: harvested goods go "to the cellar" (a screenshot shows "To cellar: Wool ×1"), where they are sold.
- **Pests**: crows and toads on beds; neighbours help chase them away.
- **Pet**: neighbours' requests included "feed Kukusik".
- **Neighbours**: "visiting 10 neighbours, chasing pests, fertilizing and watering should bring 500 gold a day"; help is a few beds per neighbour per day.
- **Farm expansions**: 10×10 for 500 coins; 12×12 for 5 diamonds or 10 neighbours; 14×14 for 25 diamonds or 25 neighbours; 16×16 for 50 neighbours or diamonds; then 18×18.
- **Currencies**: coins (gold) and diamonds; diamonds were fractional (a player had "46.92") and were awarded for achievements (e.g. 1.5 for the tractor ones) and for orders.
- **Gifts**: free gifts from neighbours (ostrich, pig, horse, the cow Burenka, orange, olives, avocado, banana, birch, rowan), materials (wood for free, plastic film as a gift "for 1000"). You could mark with a heart what you wanted to receive.
- **Workshop**: greenhouse = 20 wood + 10 film; the greenhouse holds 12 plants on 6 tiles and needs no digging. A level-2 workshop cost diamonds.
- **Anniversary buildings (summer 2011)**: mill, juice press, kitchen (processing crops into pricier products), workshop (decor and gifts).
- **Pens and coops** from level 10.
- **The "Zoo" update**: animals "left" after several harvests — players were unhappy. *In the remake animals don't die.*
- **Character**: a farm boy or girl you can dress up, who walks around the plot and "digs the beds funnily".

## Crop, tree and animal table

Transferred to [`src/data/items.ts`](../src/data/items.ts) from the ampersant.ru guide (data before the "Zoo" update, summer 2011): XP, level, ripening hours, seed price and sale price for 37 crops; price, level, fruiting period and fruit price for 24 trees; the same for 20 animals.

## What was invented

Marked in code with `// invented`: the XP curve, the decor catalogue, mill/juice press/kitchen recipes (except the greenhouse), animal products, achievements, orders, the exact effects of watering (+10 % growth) and fertilizer (+15 %), pest frequency, and the sheep (screenshots show sheep and "Wool").

## Sources (in Russian)

- [irecommend.ru — "Lovely Farm" reviews](https://irecommend.ru/content/lyubimaya-ferma-lovely-farm)
- [ampersant.ru — secrets and planting calculations](http://www.ampersant.ru/lyubimaya-ferma/)
- [amic.ru — the game's first anniversary](https://www.amic.ru/news/igre-kompanii-mail-ru-lyubimaya-ferma-ispolnilsya-god-138109)
- [bolshoyvopros.ru — rubies and diamonds](https://www.bolshoyvopros.ru/questions/458538-igra-ljubimaja-ferma-mailru-kak-bystro-zarabotat-rubiny-i-brillianty.html)
- otvet.mail.ru — [game secrets](https://otvet.mail.ru/question/38963241), [level-2 workshop](https://otvet.mail.ru/question/57459837), [18×18 expansion](https://otvet.mail.ru/question/36298676)
- [ok.ru/game/lovelyfarm](https://m.ok.ru/game/lovelyfarm)
- Lovely Farm communities on "My World"

# Сертифікат для запечатування документів

VilnoEDO використовує сертифікат `.p12` для криптографічного запечатування (sealing) завершених документів. Без нього застосунок запускається, але запечатування недоступне.

Самопідписаний сертифікат для тестування:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 730 -nodes
openssl pkcs12 -export -out cert.p12 -inkey key.pem -in cert.pem
```

Шлях до сертифіката задається змінною `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH` (у проді монтується як `/opt/documenso/cert.p12`, див. [deploy/compose.yml](deploy/compose.yml)), пароль — `NEXT_PRIVATE_SIGNING_PASSPHRASE`.

Для юридично значущого підписання КЕП/УЕП використовується окремий UA KEP signing flow (див. [README](README.md)) — сертифікат запечатування його не замінює.

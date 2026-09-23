# SpinLab Table Tennis

PoC interativa focada no movimento inicial do saque: contato com a raquete, primeiro quique no lado do servidor e segundo quique no lado do recebedor. A configuração inicial identifica **Hurricane 3 Neo Provincial Blue Sponge 40°** nos dois lados do contato.

## Executar

```bash
npm install
npm run dev
```

Para validar a compilação: `npm run build`.

## Modelo atual

- Bola de 40 mm e 2,7 g; mesa com dimensões regulamentares.
- Impacto impulsivo com restituição normal e atrito estático/cinético. A raquete tem movimento prescrito e não recua.
- Voo com gravidade, arrasto quadrático e força Magnus; integração por ponto médio e detecção do primeiro cruzamento do plano da mesa.
- Os coeficientes de contato da Hurricane 3 Neo e os coeficientes aerodinâmicos **ainda não foram medidos**. Os valores atuais são ilustrativos. A saída não deve ser interpretada como previsão quantitativa validada para essa borracha.
- O cenário começa no instante do contato do saque, no lado do servidor. A simulação inclui a rede no centro, o primeiro quique, o contato com a raquete da recepção e o quique do retorno.
- As duas raquetes têm parâmetros independentes de velocidade, inclinação, ângulo lateral e escovada.

O módulo `src/physics.ts` não depende do renderizador. A próxima etapa física é medir saídas para diferentes velocidades, giros e ângulos, ajustar os parâmetros e verificar erros em ensaios separados dos de calibração.

# Testes

Rodam sozinhos no GitHub (aba Actions) a cada alteração. Para rodar no computador:

    python -m py_compile kh.py
    node tests/cli.test.mjs
    node tests/ui.test.cjs && node tests/ui2.test.cjs
    node tests/md1.test.cjs && node tests/md2.test.cjs

Precisam de Node 20+ e Python 3. Não usam internet nem o seu Firebase: simulam o banco.
Eles conferem, entre outras coisas, que o site e as regras do Firestore usam os mesmos campos.

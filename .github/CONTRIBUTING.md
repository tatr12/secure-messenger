# Contribution Rules


## Branches

main:
- stable version
- production ready


feature/*:
- development branches


Запрещено:
- делать изменения напрямую в main


Перед работой:

git checkout main
git pull

git checkout -b feature/name


После работы:

git push origin feature/name


Изменения попадают в main только через Pull Request.

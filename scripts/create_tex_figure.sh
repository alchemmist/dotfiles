figure_name=$(rofi -dmenu -p 'Enter figure name:')

res=$(inkscape-figures create $figure_name /home/alchemmist/knowledge-base/CU/figures)

wl-copy $res 

echo $res 

hyprctl dispatch workspace 7

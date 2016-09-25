begin

    wksType = "ps"
    wksType@wkBackgroundColor = "black"
    ; wksType@wkBackgroundOpacityF = 0
    wks = gsn_open_wks(wksType, "map_antarctica")

    res = True
    res@gsnDraw           = False
    res@gsnFrame          = False
    res@gsnMaximize       = True
    res@gsnPolar          = "SH"
    res@gsnTickMarksOn    = False
    res@mpDataSetName     = "Earth..4"
    res@mpDataBaseVersion = "MediumRes"
    res@mpMaxLatF         = -60
    res@mpGridAndLimbOn   = False
    res@mpPerimOn         = False
    res@mpFillOn          = False
    res@mpOutlineOn       = True
    res@mpOutlineSpecifiers = "Land"
    res@mpGeophysicalLineColor = "white"
    res@mpGeophysicalLineThicknessF = 10
    res@mpOutlineDrawOrder = "PreDraw"

    map = gsn_csm_map(wks,res)

    polyres = True
    polyres@gsMarkerIndex    = 16
    polyres@gsLineColor      = "red"
    polyres@gsLineThicknessF = 5
    polyres@txFontColor      = "red"
    polyres@txFontHeightF    = 0.03

    dotLat = -77.9
    dotLon = 166.7
    polyres@gsMarkerColor = "black"
    polyres@gsMarkerSizeF = 0.035
    blackDot = gsn_add_polymarker(wks, map, dotLon, dotLat, polyres)

    polyres@gsMarkerColor = "red"
    polyres@gsMarkerSizeF = 0.028
    redDot  = gsn_add_polymarker(wks, map, dotLon, dotLat, polyres)

    textLat = -76.
    textLon = 135.
    text = gsn_add_text(wks, map, "~F22~McMurdo", textLon, textLat, polyres)

    draw(map)
    frame(wks)

end
